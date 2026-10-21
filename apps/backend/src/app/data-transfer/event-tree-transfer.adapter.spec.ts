import { TRANSFER_MAX_RESOURCES, type TransferResource } from '@cacic-fct/shared-data-transfer';
import { Permission } from '@cacic-fct/shared-permissions';
import { diffResourceData } from './data-transfer.service';
import type { TransferAdapterContext } from './data-transfer-adapter';
import { EventTreeTransferAdapter } from './event-tree-transfer.adapter';
import { audienceContext } from '../audiences/audience-context';
import { ForbiddenException } from '@nestjs/common';
import { DataTransferService } from './data-transfer.service';
import { TransferKeyAllocations } from './transfer-key-allocations';
const { jest } = import.meta;

describe('EventTreeTransferAdapter normalization and mutations', () => {
  it('persists an imported schedule with lifecycle dates and the current publication actor', async () => {
    const before = eventRecord({ publicationState: 'PUBLISHED', publishedAt: new Date() });
    const scheduledPublishAt = relativeDate(1);
    const tx = eventUpdateTransaction(before, before);
    const adapter = createAdapter(tx);
    const resource: TransferResource = {
      kind: 'event',
      id: before.id,
      data: { publicationState: 'SCHEDULED', scheduledPublishAt },
    };
    const context = createContext(tx, [resource]);
    const snapshot = await adapter.resolve(resource, context);
    await adapter.validate(snapshot, context);
    await adapter.apply(snapshot, 'update', context);
    expect(tx.event.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publicationState: 'SCHEDULED',
          scheduledPublishAt: new Date(scheduledPublishAt),
          publishedAt: null,
          unpublishedAt: null,
          publicationUpdatedBy: 'organizer-1',
          publicationScheduledBy: 'organizer-1',
        }),
      }),
    );
  });

  it('applies an invitation-only update and refreshes attendance without other audience fields', async () => {
    const before = eventRecord({ audienceInvitations: [{ personId: 'old-person' }] });
    const updated = { ...before, audienceInvitations: [{ personId: 'person-1' }] };
    const tx = {
      ...eventUpdateTransaction(before, updated),
      event: {
        ...eventUpdateTransaction(before, updated).event,
        update: jest.fn().mockResolvedValue(updated),
      },
    };
    const invitations = {
      replaceInvitations: jest.fn().mockResolvedValue({
        invitations: [{ personId: 'person-1' }],
        addedPersonIds: ['person-1'],
        removedPersonIds: ['old-person'],
      }),
    };
    const adapter = createAdapter(tx, undefined, undefined, invitations);
    const resource: TransferResource = { kind: 'event', id: before.id, data: { invitationPersonIds: ['person-1'] } };
    const context = createContext(tx, [resource]);
    const snapshot = await adapter.resolve(resource, context);
    expect(diffResourceData(snapshot.current, snapshot.resource)).toContainEqual({
      field: 'invitationPersonIds',
      before: ['old-person'],
      after: ['person-1'],
    });
    const result = await adapter.apply(snapshot, 'update', context);
    expect(invitations.replaceInvitations).toHaveBeenCalledWith(
      { targetType: 'EVENT', targetId: before.id },
      ['person-1'],
      'organizer-1',
      tx,
    );
    expect(result.postCommitEffects).toHaveLength(2);
  });

  it.each(['event', 'group', 'major-event'] as const)(
    'exports %s publication and invitees only when requested',
    async (kind) => {
      const record = eventRecord({
        audienceInvitations: [{ personId: 'person-2' }, { personId: 'person-1' }],
        publicationState: 'PUBLISHED',
        publishedAt: relativeDate(-1),
        scheduledPublishAt: null,
        unpublishedAt: null,
        sportsCategory: null,
      });
      const tx = {
        event: { findFirst: jest.fn().mockResolvedValue(record) },
        eventGroup: { findFirst: jest.fn().mockResolvedValue(record) },
        majorEvent: { findFirst: jest.fn().mockResolvedValue(record) },
      };
      const adapter = createAdapter(tx);
      const options = { includeDescendants: false, includeConfiguration: false };
      const defaults = await adapter.exportTarget({ kind, id: record.id }, options, createContext(tx));
      expect(defaults.resources[0].data).not.toHaveProperty('publicationState');
      expect(defaults.resources[0].data).not.toHaveProperty('invitationPersonIds');
      const selected = await adapter.exportTarget(
        { kind, id: record.id },
        {
          ...options,
          includePublishingState: true,
          includeAudienceInvitations: true,
        },
        createContext(tx),
      );
      expect(selected.resources[0].data).toMatchObject({ invitationPersonIds: ['person-1', 'person-2'] });
      if (kind === 'group') expect(selected.resources[0].data).not.toHaveProperty('publicationState');
      else
        expect(selected.resources[0].data).toMatchObject({ publicationState: 'PUBLISHED', scheduledPublishAt: null });
    },
  );

  it.each([
    ['event', Permission.Event.Update, 'eventId'],
    ['group', Permission.EventGroup.Update, 'eventGroupId'],
    ['major-event', Permission.MajorEvent.Update, 'majorEventId'],
  ] as const)('omits %s invitees without update permission', async (kind, permission, scopeField) => {
    const record = eventRecord({ audienceInvitations: [{ personId: 'private-person' }], sportsCategory: null });
    const tx = {
      event: { findFirst: jest.fn().mockResolvedValue(record) },
      eventGroup: { findFirst: jest.fn().mockResolvedValue(record) },
      majorEvent: { findFirst: jest.fn().mockResolvedValue(record) },
    };
    const authorization = {
      assertPermissions: jest.fn(async (_actor, permissions: readonly Permission[]) => {
        if (permissions.includes(permission)) throw new ForbiddenException();
      }),
    };
    const context = createContext(tx);
    const result = await createAdapter(tx, authorization).exportTarget(
      { kind, id: record.id },
      { includeDescendants: false, includeConfiguration: false, includeAudienceInvitations: true },
      context,
    );
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].data).not.toHaveProperty('invitationPersonIds');
    expect(result.issues).toHaveLength(1);
    expect(authorization.assertPermissions).toHaveBeenCalledWith(context.actor, [permission], {
      [scopeField]: record.id,
    });
  });

  it('checks descendant invitation access independently of the root grant', async () => {
    const group = eventRecord({
      id: 'group-1',
      sportsCategory: null,
      audienceInvitations: [{ personId: 'group-invitee' }],
    });
    const event = eventRecord({
      id: 'event-1',
      eventGroupId: group.id,
      audienceInvitations: [{ personId: 'event-invitee' }],
    });
    const tx = {
      eventGroup: { findFirst: jest.fn().mockResolvedValue(group) },
      event: { findMany: jest.fn().mockResolvedValue([event]) },
    };
    const authorization = {
      assertPermissions: jest.fn(async (_actor, permissions: readonly Permission[]) => {
        if (permissions.includes(Permission.Event.Update)) throw new ForbiddenException();
      }),
    };
    const result = await createAdapter(tx, authorization).exportTarget(
      { kind: 'group', id: group.id },
      { includeDescendants: true, includeConfiguration: false, includeAudienceInvitations: true },
      createContext(tx),
    );
    expect(result.resources.find((row) => row.kind === 'group')?.data).toHaveProperty('invitationPersonIds', [
      'group-invitee',
    ]);
    expect(result.resources.find((row) => row.kind === 'event')?.data).not.toHaveProperty('invitationPersonIds');
    expect(result.issues).toHaveLength(1);
  });

  it.each(['major-event', 'group'] as const)(
    'bounds %s descendant events before authorizing each child',
    async (kind) => {
      const tx = {
        majorEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'root-1', updatedAt: new Date() }) },
        eventGroup: {
          findFirst: jest.fn().mockResolvedValue({ id: 'root-1', updatedAt: new Date(), sportsCategory: null }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        event: {
          findMany: jest
            .fn()
            .mockResolvedValue(Array.from({ length: TRANSFER_MAX_RESOURCES + 1 }, () => eventRecord())),
        },
      };
      const authorization = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
      await expect(
        createAdapter(tx, authorization).exportTarget(
          { kind, id: 'root-1' },
          { includeDescendants: true, includeConfiguration: false },
          createContext(tx),
        ),
      ).rejects.toThrow('limite de recursos');
      expect(tx.event.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: TRANSFER_MAX_RESOURCES + 1 }));
      expect(authorization.assertPermissions).toHaveBeenCalledTimes(1);
    },
  );

  it('bounds descendant groups before querying their events', async () => {
    const tx = {
      majorEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'root-1', updatedAt: new Date() }) },
      eventGroup: {
        findMany: jest
          .fn()
          .mockResolvedValue(Array.from({ length: TRANSFER_MAX_RESOURCES + 1 }, () => ({ id: 'group-1' }))),
      },
      event: { findMany: jest.fn() },
    };
    await expect(
      createAdapter(tx).exportTarget(
        { kind: 'major-event', id: 'root-1' },
        { includeDescendants: true, includeConfiguration: false },
        createContext(tx),
      ),
    ).rejects.toThrow('limite de recursos');
    expect(tx.eventGroup.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: TRANSFER_MAX_RESOURCES + 1 }));
    expect(tx.event.findMany).not.toHaveBeenCalled();
  });

  it('enforces the existing and proposed parent certificate settings', async () => {
    const event = eventRecord({ eventGroupId: 'group-1', shouldIssueCertificate: true });
    const tx = {
      event: { findFirst: jest.fn().mockResolvedValue(event) },
      eventGroup: { findFirst: jest.fn().mockResolvedValue({ shouldIssueCertificate: false }) },
    };
    const adapter = createAdapter(tx);
    const resource: TransferResource = { kind: 'event', id: event.id, data: { shouldIssueCertificate: true } };
    const snapshot = await adapter.resolve(resource, createContext(tx, [resource]));
    expect(snapshot.resource.data).toMatchObject({
      shouldIssueCertificate: false,
      shouldIssueCertificateForNonPayingAttendees: false,
    });

    tx.eventGroup.findFirst.mockResolvedValue({ shouldIssueCertificate: true });
    const group: TransferResource = { kind: 'group', id: 'group-1', data: { shouldIssueCertificate: false } };
    const proposed = await adapter.resolve(resource, createContext(tx, [resource, group]));
    expect(proposed.resource.data).toMatchObject({ shouldIssueCertificate: false });
    expect(proposed.dependencies).toContainEqual({ kind: 'group', id: 'group-1' });
  });

  it.each([
    ['subscriptionStartDate', 'subscriptionEndDate'],
    ['onlineAttendanceStartDate', 'onlineAttendanceEndDate'],
  ])('rejects a reversed %s window while preserving the omitted bound', async (startField, endField) => {
    const event = eventRecord({ [startField]: relativeDate(1), [endField]: relativeDate(2) });
    const tx = { event: { findFirst: jest.fn().mockResolvedValue(event) } };
    const adapter = createAdapter(tx);
    const resource = { kind: 'event', id: event.id, data: { [startField]: relativeDate(3) } } as TransferResource;
    const context = createContext(tx, [resource]);
    await expect(adapter.validate(await adapter.resolve(resource, context), context)).rejects.toThrow(
      'precisa ser posterior',
    );
  });

  it('authorizes and fingerprints every implicit child certificate change', async () => {
    const child = eventRecord({ eventGroupId: 'group-1', shouldIssueCertificate: true });
    const group = {
      id: 'group-1',
      updatedAt: new Date(),
      name: 'Group',
      shouldIssueCertificate: true,
      majorEventId: null,
      sportsCategory: null,
    };
    const tx = {
      event: { findMany: jest.fn().mockResolvedValue([child]), findFirst: jest.fn().mockResolvedValue(child) },
      eventGroup: { findFirst: jest.fn().mockResolvedValue(group) },
    };
    const authorization = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
    const frozen = { assertEventUpdateMutable: jest.fn().mockResolvedValue(undefined) };
    const adapter = createAdapter(tx, authorization, frozen);
    const resource: TransferResource = { kind: 'group', id: group.id, data: { shouldIssueCertificate: false } };
    const context = createContext(tx, [resource]);
    const snapshot = await adapter.resolve(resource, context);
    await adapter.validate(snapshot, context);
    expect(snapshot.additionalChanges?.[0]).toMatchObject({
      field: 'Certificados dos eventos filhos',
      before: [expect.objectContaining({ id: child.id, nome: child.name, 'Emitir certificados': true })],
      after: [expect.objectContaining({ id: child.id, 'Emitir certificados': false })],
    });
    expect(snapshot.relatedRevisions).toEqual([
      { kind: 'event', id: child.id, revision: child.updatedAt.toISOString() },
    ]);
    expect(authorization.assertPermissions).toHaveBeenCalledWith(
      context.actor,
      [Permission.DataTransfer.Import, Permission.Event.Update],
      expect.objectContaining({ eventId: child.id }),
    );
    expect(frozen.assertEventUpdateMutable).toHaveBeenCalled();
    authorization.assertPermissions.mockRejectedValue(new ForbiddenException());
    await expect(adapter.validate(await adapter.resolve(resource, context), context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a group plan if an implicit child changes after preview, before any write', async () => {
    let child = eventRecord({ eventGroupId: 'group-1', shouldIssueCertificate: true });
    const group = {
      id: 'group-1',
      updatedAt: new Date(),
      name: 'Group',
      shouldIssueCertificate: true,
      majorEventId: null,
    };
    const tx = {
      event: { findMany: jest.fn(async () => [child]), findFirst: jest.fn(async () => child), updateMany: jest.fn() },
      eventGroup: { findFirst: jest.fn().mockResolvedValue(group), updateMany: jest.fn() },
    };
    const adapter = createAdapter(tx);
    const prisma = { $transaction: jest.fn(async (operation: (value: unknown) => Promise<unknown>) => operation(tx)) };
    const journal = { findCommittedRequest: jest.fn().mockResolvedValue(null), begin: jest.fn() };
    const service = new DataTransferService(
      prisma as never,
      { assertPermissions: jest.fn() } as never,
      {} as never,
      [adapter],
      new TransferKeyAllocations(),
      journal as never,
    );
    const document = {
      format: 'cacic-event-data',
      version: 1,
      resources: [{ kind: 'group', id: group.id, data: { shouldIssueCertificate: false } }],
    };
    const actor = createContext(tx).actor;
    const preview = await service.preview({ document }, actor);
    child = { ...child, updatedAt: new Date(child.updatedAt.getTime() + 1) };
    await expect(service.apply({ document, planHash: preview.planHash, allowPartial: false }, actor)).rejects.toThrow(
      'mudaram desde a prévia',
    );
    expect(journal.begin).not.toHaveBeenCalled();
    expect(tx.event.updateMany).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'applies a group disable and child rename without a self-conflict (child first: %s)',
    async (childFirst) => {
      let event = eventRecord({ eventGroupId: 'group-1', shouldIssueCertificate: true });
      let group = {
        id: 'group-1',
        updatedAt: new Date(),
        name: 'Group',
        shouldIssueCertificate: true,
        majorEventId: null,
        sportsCategory: null,
      };
      const tx = {
        event: {
          findFirst: jest.fn(async () => event),
          findMany: jest.fn(async () => [event]),
          findUniqueOrThrow: jest.fn(async () => event),
          updateMany: jest.fn(async ({ where, data }) => {
            if (where.updatedAt.getTime() !== event.updatedAt.getTime()) return { count: 0 };
            event = { ...event, ...data, updatedAt: new Date(event.updatedAt.getTime() + 1) };
            return { count: 1 };
          }),
        },
        eventGroup: {
          findFirst: jest.fn(async () => group),
          findUniqueOrThrow: jest.fn(async () => group),
          updateMany: jest.fn(async ({ data }) => {
            group = { ...group, ...data };
            return { count: 1 };
          }),
        },
      };
      const adapter = createAdapter(tx);
      const prisma = {
        $transaction: jest.fn(async (operation: (value: unknown) => Promise<unknown>) => operation(tx)),
      };
      const journal = {
        findCommittedRequest: jest.fn().mockResolvedValue(null),
        begin: () => ({ tx, setSource: jest.fn() }),
        record: jest.fn().mockResolvedValue({ batchId: 'batch-1' }),
      };
      const service = new DataTransferService(
        prisma as never,
        { assertPermissions: jest.fn() } as never,
        {} as never,
        [adapter],
        new TransferKeyAllocations(),
        journal as never,
      );
      const document = {
        format: 'cacic-event-data',
        version: 1,
        resources: [
          { kind: 'event', id: event.id, data: { name: 'Renamed event' } },
          { kind: 'group', id: group.id, data: { shouldIssueCertificate: false } },
        ],
      };
      if (!childFirst) document.resources.reverse();
      const actor = createContext(tx).actor;
      const preview = await service.preview({ document }, actor);
      const result = await service.apply({ document, planHash: preview.planHash, allowPartial: false }, actor);
      expect(result.applied).toBe(true);
      expect(event).toMatchObject({ name: 'Renamed event', shouldIssueCertificate: false });
      expect(tx.event.updateMany).toHaveBeenCalledTimes(1);
    },
  );

  it('previews and applies a name-only change without resetting omitted event fields or synchronizing its parent', async () => {
    const event = eventRecord({
      name: 'Old title',
      type: 'PALESTRA',
      creditMinutes: 90,
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: true,
      shouldIssueCertificateForNonSubscribedAttendees: true,
      eventGroupId: 'group-1',
      majorEventId: null,
      eventGroup: { majorEventId: 'major-1' },
    });
    const updated = { ...event, name: 'New title' };
    const tx = {
      event: {
        findFirst: jest.fn().mockResolvedValue(event),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updated),
      },
      eventGroup: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          shouldIssueCertificate: true,
          shouldIssueCertificateForNonPayingAttendees: true,
          shouldIssueCertificateForNonSubscribedAttendees: true,
        }),
      },
    };
    const adapter = createAdapter(tx);
    const resource: TransferResource = { kind: 'event', id: event.id, data: { name: '  New title  ' } };
    const context = createContext(tx, [resource]);
    const snapshot = await adapter.resolve(resource, context);

    expect(diffResourceData(snapshot.current, snapshot.resource)).toEqual([
      { field: 'name', before: 'Old title', after: 'New title' },
    ]);
    expect(snapshot.resource.data).not.toHaveProperty('type');
    expect(snapshot.resource.data).not.toHaveProperty('majorEventId');

    await adapter.apply(snapshot, 'update', context);

    const writtenData = tx.event.updateMany.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(writtenData).toMatchObject({ name: 'New title' });
    expect(writtenData).not.toHaveProperty('type');
    expect(writtenData).not.toHaveProperty('creditMinutes');
    expect(writtenData).not.toHaveProperty('shouldIssueCertificate');
    expect(writtenData).not.toHaveProperty('shouldIssueCertificateForNonPayingAttendees');
    expect(writtenData).not.toHaveProperty('shouldIssueCertificateForNonSubscribedAttendees');
    expect(tx.eventGroup.findMany).not.toHaveBeenCalled();
  });

  it.each(['eventGroupId', 'majorEventId'] as const)(
    'rejects changing the existing event %s parent before writing',
    async (field) => {
      const event = eventRecord({ eventGroupId: 'group-current', majorEventId: 'major-current' });
      const tx = {
        event: {
          findFirst: jest.fn().mockResolvedValue(event),
          updateMany: jest.fn(),
        },
        eventGroup: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'group-current',
            majorEventId: 'major-current',
            shouldIssueCertificate: false,
          }),
        },
      };
      const adapter = createAdapter(tx);
      const resource: TransferResource = {
        kind: 'event',
        id: event.id,
        data: field === 'eventGroupId' ? { eventGroupId: 'group-other' } : { majorEventId: 'major-other' },
      };
      const context = createContext(tx, [resource]);
      const snapshot = await adapter.resolve(resource, context);

      await expect(adapter.validate(snapshot, context)).rejects.toThrow('não pode alterar o vínculo pai');
      expect(tx.event.updateMany).not.toHaveBeenCalled();
    },
  );

  it('shows and applies certificate flags derived from an explicit event disable', async () => {
    const event = eventRecord({
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: true,
      shouldIssueCertificateForNonSubscribedAttendees: true,
    });
    const updated = {
      ...event,
      shouldIssueCertificate: false,
      shouldIssueCertificateForNonPayingAttendees: false,
      shouldIssueCertificateForNonSubscribedAttendees: false,
    };
    const tx = eventUpdateTransaction(event, updated);
    const adapter = createAdapter(tx);
    const resource: TransferResource = { kind: 'event', id: event.id, data: { shouldIssueCertificate: false } };
    const context = createContext(tx, [resource]);
    const snapshot = await adapter.resolve(resource, context);

    expect(snapshot.resource.data).toMatchObject({
      shouldIssueCertificate: false,
      shouldIssueCertificateForNonPayingAttendees: false,
      shouldIssueCertificateForNonSubscribedAttendees: false,
    });
    expect(diffResourceData(snapshot.current, snapshot.resource)).toEqual(
      expect.arrayContaining([
        { field: 'shouldIssueCertificateForNonPayingAttendees', before: true, after: false },
        { field: 'shouldIssueCertificateForNonSubscribedAttendees', before: true, after: false },
      ]),
    );

    await adapter.apply(snapshot, 'update', context);

    expect(tx.event.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shouldIssueCertificate: false,
          shouldIssueCertificateForNonPayingAttendees: false,
          shouldIssueCertificateForNonSubscribedAttendees: false,
        }),
      }),
    );
  });

  it('shows and applies the canonical YouTube code extracted from a URL', async () => {
    const event = eventRecord({ youtubeCode: 'old-code' });
    const updated = { ...event, youtubeCode: 'abc-123_X' };
    const tx = eventUpdateTransaction(event, updated);
    const adapter = createAdapter(tx);
    const resource: TransferResource = {
      kind: 'event',
      id: event.id,
      data: { youtubeCode: 'https://youtu.be/abc-123_X?si=tracking' },
    };
    const context = createContext(tx, [resource]);
    const snapshot = await adapter.resolve(resource, context);

    if (snapshot.resource.kind !== 'event') throw new Error('Expected an event snapshot.');
    expect(snapshot.resource.data.youtubeCode).toBe('abc-123_X');
    expect(diffResourceData(snapshot.current, snapshot.resource)).toEqual([
      { field: 'youtubeCode', before: 'old-code', after: 'abc-123_X' },
    ]);

    await adapter.apply(snapshot, 'update', context);

    expect(tx.event.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ youtubeCode: 'abc-123_X' }),
      }),
    );
  });

  it('previews and applies the derived certificate flag for payment-required major events', async () => {
    const majorEvent = {
      id: 'major-1',
      updatedAt: new Date(),
      deletedAt: null,
      name: 'Series',
      isPaymentRequired: false,
      shouldIssueCertificateForNonPayingAttendees: true,
      shouldIssueCertificateForNonSubscribedAttendees: true,
      sportsTournament: null,
    };
    const updated = { ...majorEvent, isPaymentRequired: true, shouldIssueCertificateForNonPayingAttendees: false };
    const tx = {
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue(majorEvent),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updated),
      },
    };
    const adapter = createAdapter(tx);
    const resource: TransferResource = { kind: 'major-event', id: 'major-1', data: { isPaymentRequired: true } };
    const context = createContext(tx, [resource]);
    const snapshot = await adapter.resolve(resource, context);

    expect(snapshot.resource.data).toMatchObject({
      isPaymentRequired: true,
      shouldIssueCertificateForNonPayingAttendees: false,
    });
    expect(diffResourceData(snapshot.current, snapshot.resource)).toEqual(
      expect.arrayContaining([
        { field: 'isPaymentRequired', before: false, after: true },
        { field: 'shouldIssueCertificateForNonPayingAttendees', before: true, after: false },
      ]),
    );

    await adapter.apply(snapshot, 'update', context);

    expect(tx.majorEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isPaymentRequired: true, shouldIssueCertificateForNonPayingAttendees: false }),
      }),
    );
  });

  it('previews and authorizes canonicalizing an existing legacy group when creating its first major-event child', async () => {
    const group = { id: 'group-1', majorEventId: null };
    const majorEvent = { id: 'major-1' };
    const createdEvent = eventRecord({ eventGroupId: 'group-1', majorEventId: 'major-1' });
    const authorization = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
    const frozen = {
      assertEventGroupMutable: jest.fn().mockResolvedValue(undefined),
      assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
    };
    const tx = {
      event: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ majorEventId: 'major-1' }]),
        create: jest.fn().mockResolvedValue(createdEvent),
      },
      eventGroup: {
        findFirst: jest.fn().mockResolvedValue(group),
        findMany: jest.fn().mockResolvedValue([group]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      majorEvent: { findFirst: jest.fn().mockResolvedValue(majorEvent) },
    };
    const adapter = createAdapter(tx, authorization, frozen);
    const resource: TransferResource = {
      kind: 'event',
      id: 'event-new',
      data: {
        name: 'New event',
        startDate: relativeDate(7),
        endDate: relativeDate(7, 1),
        eventGroupId: 'group-1',
        majorEventId: 'major-1',
      },
    };
    const context = createContext(tx, [resource]);
    const snapshot = await adapter.resolve(resource, context);

    expect(snapshot.additionalChanges).toEqual([
      { field: 'Grande evento do grupo pai', before: null, after: 'major-1' },
    ]);
    await adapter.assertRead(snapshot, context);
    await adapter.assertWrite(snapshot, 'create', context);
    await adapter.assertMutable(snapshot, 'edit', context);
    await adapter.validate(snapshot, context);
    expect(authorization.assertPermissions).toHaveBeenCalledWith(
      expect.anything(),
      [Permission.EventGroup.Read, Permission.EventGroup.Update],
      { eventGroupId: 'group-1' },
    );
    expect(frozen.assertEventGroupMutable).toHaveBeenCalledWith('group-1', expect.anything(), 'edit');
    expect(frozen.assertMajorEventMutable).toHaveBeenCalledWith('major-1', expect.anything(), 'edit');

    await adapter.apply(snapshot, 'create', context);

    expect(tx.eventGroup.updateMany).toHaveBeenCalledWith({
      where: { id: 'group-1', deletedAt: null, majorEventId: null },
      data: { majorEventId: 'major-1' },
    });
  });

  it('blocks a legacy group canonicalization that conflicts with an existing child', async () => {
    const tx = {
      event: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ majorEventId: 'other-major' }]),
      },
      eventGroup: { findFirst: jest.fn().mockResolvedValue({ id: 'group-1', majorEventId: null }) },
      majorEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'major-1' }) },
    };
    const adapter = createAdapter(tx);
    const resource: TransferResource = {
      kind: 'event',
      id: 'event-new',
      data: {
        name: 'New event',
        startDate: relativeDate(7),
        endDate: relativeDate(7, 1),
        eventGroupId: 'group-1',
        majorEventId: 'major-1',
      },
    };
    const context = createContext(tx, [resource]);
    const snapshot = await adapter.resolve(resource, context);

    await expect(adapter.validate(snapshot, context)).rejects.toThrow(
      'Os eventos deste grupo precisam pertencer ao mesmo grande evento.',
    );
  });

  it('infers the major event from a typed existing group when the new event only names the group', async () => {
    const group = { id: 'group-1', majorEventId: 'major-1' };
    const createdEvent = eventRecord({ id: 'event-new', eventGroupId: 'group-1', majorEventId: 'major-1' });
    const tx = {
      event: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ majorEventId: 'major-1' }]),
        create: jest.fn().mockResolvedValue(createdEvent),
      },
      eventGroup: {
        findFirst: jest.fn().mockResolvedValue(group),
        findMany: jest.fn().mockResolvedValue([group]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      majorEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'major-1' }) },
    };
    const adapter = createAdapter(tx);
    const resource: TransferResource = {
      kind: 'event',
      id: 'event-new',
      data: { name: 'New event', startDate: relativeDate(7), endDate: relativeDate(7, 1), eventGroupId: 'group-1' },
    };
    const context = createContext(tx, [resource]);
    const snapshot = await adapter.resolve(resource, context);

    if (snapshot.resource.kind !== 'event') throw new Error('Expected an event snapshot.');
    expect(snapshot.resource.data.majorEventId).toBe('major-1');
    expect(snapshot.additionalChanges).toBeUndefined();
    await adapter.validate(snapshot, context);
    await adapter.apply(snapshot, 'create', context);

    expect(tx.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventGroupId: 'group-1', majorEventId: 'major-1' }),
      }),
    );
    expect(tx.eventGroup.updateMany).not.toHaveBeenCalled();
  });

  it('infers a legacy parent from one hidden sibling under bypass and previews the parent write', async () => {
    const group = { id: 'group-1', majorEventId: null };
    const majorEvent = { id: 'major-1' };
    const createdEvent = eventRecord({ id: 'event-new', eventGroupId: 'group-1', majorEventId: 'major-1' });
    const bypassChecks: boolean[] = [];
    const tx = {
      event: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockImplementation(async () => {
          bypassChecks.push(audienceContext.getStore()?.bypass === true);
          return [{ majorEventId: 'major-1' }];
        }),
        create: jest.fn().mockResolvedValue(createdEvent),
      },
      eventGroup: {
        findFirst: jest.fn().mockResolvedValue(group),
        findMany: jest.fn().mockResolvedValue([group]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      majorEvent: { findFirst: jest.fn().mockResolvedValue(majorEvent) },
    };
    const adapter = createAdapter(tx);
    const resource: TransferResource = {
      kind: 'event',
      id: 'event-new',
      data: { name: 'New event', startDate: relativeDate(7), endDate: relativeDate(7, 1), eventGroupId: 'group-1' },
    };
    const context = createContext(tx, [resource]);
    const snapshot = await adapter.resolve(resource, context);

    if (snapshot.resource.kind !== 'event') throw new Error('Expected an event snapshot.');
    expect(snapshot.resource.data.majorEventId).toBe('major-1');
    expect(snapshot.additionalChanges).toEqual([
      { field: 'Grande evento do grupo pai', before: null, after: 'major-1' },
    ]);
    await adapter.assertWrite(snapshot, 'create', context);
    await adapter.validate(snapshot, context);
    await adapter.apply(snapshot, 'create', context);

    expect(bypassChecks.length).toBeGreaterThanOrEqual(2);
    expect(bypassChecks.every(Boolean)).toBe(true);
    expect(tx.eventGroup.updateMany).toHaveBeenCalledWith({
      where: { id: 'group-1', deletedAt: null, majorEventId: null },
      data: { majorEventId: 'major-1' },
    });
  });
});

function createAdapter(
  tx: Record<string, unknown>,
  authorization?: Record<string, unknown>,
  frozen: Record<string, unknown> = {
    assertEventMutable: jest.fn().mockResolvedValue(undefined),
    assertEventUpdateMutable: jest.fn().mockResolvedValue(undefined),
    assertEventGroupMutable: jest.fn().mockResolvedValue(undefined),
    assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
  },
  invitations: Record<string, unknown> = {},
): EventTreeTransferAdapter {
  return new EventTreeTransferAdapter(
    tx as never,
    (authorization ?? { assertPermissions: jest.fn().mockResolvedValue(undefined) }) as never,
    frozen as never,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
    invitations as never,
    {
      syncEvent: jest.fn().mockResolvedValue(undefined),
      syncEventGroup: jest.fn().mockResolvedValue(undefined),
    } as never,
    { refreshForEvent: jest.fn().mockResolvedValue(undefined) } as never,
    { notifyAllConnectedPeople: jest.fn().mockResolvedValue(undefined) } as never,
    {
      assertEventUpdateAllowed: jest.fn().mockResolvedValue(undefined),
      synchronizeEventGroupUpdate: jest.fn().mockResolvedValue(undefined),
    } as never,
    {
      lockEventExpirationAlignment: jest.fn().mockResolvedValue(undefined),
      alignActiveTicketExpirations: jest.fn().mockResolvedValue(undefined),
    } as never,
    { refresh: jest.fn().mockResolvedValue(undefined) } as never,
    { upsertMajorEvent: jest.fn().mockResolvedValue(undefined) } as never,
    { publish: jest.fn().mockResolvedValue(undefined), scope: (value: string) => value } as never,
  );
}

function createContext(tx: Record<string, unknown>, resources: TransferResource[] = []): TransferAdapterContext {
  return {
    tx: tx as never,
    actor: { sub: 'organizer-1' } as never,
    document: { format: 'cacic-event-data', version: 1, resources } as TransferAdapterContext['document'],
    frozenResources: {
      assertEventMutable: jest.fn().mockResolvedValue(undefined),
      assertEventUpdateMutable: jest.fn().mockResolvedValue(undefined),
      assertEventGroupMutable: jest.fn().mockResolvedValue(undefined),
      assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
    } as never,
  };
}

function eventUpdateTransaction(current: Record<string, unknown>, updated: Record<string, unknown>) {
  return {
    event: {
      findFirst: jest.fn().mockResolvedValue(current),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(updated),
    },
  };
}

function eventRecord(overrides: Record<string, unknown> = {}) {
  const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  return {
    id: 'event-1',
    updatedAt: new Date(),
    deletedAt: null,
    name: 'Old title',
    emoji: '🎤',
    startDate,
    endDate,
    type: 'OTHER',
    creditMinutes: null,
    description: null,
    shortDescription: null,
    latitude: null,
    longitude: null,
    locationDescription: null,
    majorEventId: null,
    eventGroupId: null,
    audience: 'PUBLIC',
    audienceCourseCodes: [],
    interestEnabled: false,
    allowSubscription: true,
    requiresImageLicenseAgreement: false,
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    slots: null,
    autoSubscribe: false,
    attendanceEligibility: null,
    shouldIssueCertificate: false,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    regularAttendancePriceTierIds: [],
    shouldCollectAttendance: false,
    shouldAllowOralAttendance: false,
    isOnlineAttendanceAllowed: false,
    onlineAttendanceStartDate: null,
    onlineAttendanceEndDate: null,
    shouldProvideSubscriberListToLecturer: false,
    isPubliclyListed: true,
    displayLecturerProfile: false,
    youtubeCode: null,
    twitchChannel: null,
    buttonText: null,
    buttonLink: null,
    sportsMatch: null,
    eventGroup: null,
    ...overrides,
  };
}

function relativeDate(daysFromNow: number, extraHours = 0): string {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000 + extraHours * 60 * 60 * 1000).toISOString();
}
