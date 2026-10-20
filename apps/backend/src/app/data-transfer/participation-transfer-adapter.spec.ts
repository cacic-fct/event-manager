import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ResolvedTransferDocument, TransferResource } from '@cacic-fct/shared-data-transfer';
import { Permission } from '@cacic-fct/shared-permissions';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { ResolvedTransferResource, TransferAdapterContext } from './data-transfer-adapter';
import { PersonTransferMatcherService } from './person-transfer-matcher.service';
import { ParticipationTransferAdapter } from './participation-transfer-adapter';
import { transferPersonKey } from './transfer-person-creation';
import { participationRevision } from './participation-transfer-adapter';

const actor = { sub: 'organizer-1' } as AuthenticatedUser;

function transferDocument(resources: TransferResource[] = []): ResolvedTransferDocument {
  return {
    $schema: 'urn:cacic:event-data:v1',
    format: 'cacic-event-data',
    version: 1,
    resources,
  } as ResolvedTransferDocument;
}

function participationResource(
  kind: 'event-subscription' | 'group-subscription' | 'major-event-subscription' | 'event-attendance',
  id: string,
  data: Record<string, unknown>,
): TransferResource {
  return { kind, id, data } as TransferResource;
}

function createHarness() {
  const authorization = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
  const people = {
    match: jest.fn().mockResolvedValue({ id: 'person-1' }),
    hasReservedIdentity: jest.fn().mockResolvedValue(false),
    reviewCandidates: jest.fn().mockResolvedValue([]),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const categories = {
    refreshForAttendance: jest.fn().mockResolvedValue(undefined),
    refreshForMajorEventPerson: jest.fn().mockResolvedValue(undefined),
  };
  const subscriptions = {
    syncMajorEventConfirmedSubscriptions: jest
      .fn()
      .mockResolvedValue({ activeEventIds: [], archivedEventIds: [], createdEventIds: [] }),
    ensureEventIdsHaveAvailableSlots: jest.fn().mockResolvedValue(undefined),
  };
  const counters = { refresh: jest.fn().mockResolvedValue(undefined) };
  const tickets = {
    forEvent: jest.fn().mockResolvedValue(undefined),
    forMajorEvent: jest.fn().mockResolvedValue(undefined),
  };
  const sportsEvents = {};
  const adapter = new ParticipationTransferAdapter(
    authorization as never,
    people as never,
    audit as never,
    categories as never,
    subscriptions as never,
    counters as never,
    tickets as never,
    sportsEvents as never,
  );
  return { adapter, authorization, people, audit, categories, subscriptions, counters, tickets };
}

function context(tx: Record<string, unknown>, resources: TransferResource[] = []): TransferAdapterContext {
  return {
    tx,
    actor,
    document: transferDocument(resources),
    frozenResources: {
      assertEventMutable: jest.fn().mockResolvedValue(undefined),
      assertEventGroupMutable: jest.fn().mockResolvedValue(undefined),
      assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
    },
  } as unknown as TransferAdapterContext;
}

function activeEventTransaction(overrides: Record<string, unknown> = {}) {
  return {
    event: {
      findFirst: jest.fn().mockResolvedValue({ id: 'event-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    eventSubscription: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    eventAttendance: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  } as Record<string, unknown>;
}

describe('ParticipationTransferAdapter', () => {
  it.each(['event-subscription', 'event-attendance'] as const)(
    'allows person review for an existing %s with update access alone',
    async (kind) => {
      const harness = createHarness();
      const denied = kind === 'event-attendance' ? Permission.EventAttendance.Collect : Permission.Subscription.Create;
      harness.authorization.assertPermissions.mockImplementation(async (_actor, permissions) => {
        if (permissions.includes(denied)) throw new ForbiddenException();
      });
      harness.people.match.mockResolvedValue({ reviewIds: ['person-1'], message: 'Revisar dados.' });
      harness.people.reviewCandidates.mockResolvedValue([
        {
          id: 'person-1',
          name: 'Ana Silva',
          email: 'old@example.com',
          secondaryEmails: [],
          phone: null,
          academicId: null,
          identityDocument: null,
          updatedAt: new Date(),
        },
      ]);
      const reference = { name: 'Ana Silva', email: 'new@example.com' };
      const resource = participationResource(kind, 'source-participation', {
        eventId: 'event-1',
        person: reference,
        status: 'ABSENT',
        imageLicenseAgreementAccepted: true,
      });
      const stored = {
        id: 'stored-participation',
        eventId: 'event-1',
        personId: 'person-1',
        status: 'PRESENT',
        attendedAt: new Date(),
        imageLicenseAgreementAccepted: false,
      };
      const ctx = context(
        activeEventTransaction({
          eventSubscription: {
            findUnique: jest.fn().mockResolvedValue(null),
            findFirst: jest.fn().mockResolvedValue(stored),
          },
          eventAttendance: { findUnique: jest.fn().mockResolvedValue(stored) },
        }),
      );
      const pending = await harness.adapter.resolve(resource, ctx);
      expect(pending.personPrompt?.canMerge).toBe(true);
      ctx.personDecisions = [
        {
          key: transferPersonKey(reference),
          action: 'merge',
          personId: 'person-1',
          data: {},
          reviewHash: pending.personPrompt?.reviewHash,
        },
      ];
      const ready = await harness.adapter.resolve(resource, ctx);
      expect(ready.current).not.toBeNull();
      expect(ready.personMerge?.id).toBe('person-1');
      await expect(harness.adapter.assertWrite(ready, 'update', ctx)).resolves.toBeUndefined();
      // Opening review with update access must never authorize creating a participation.
      await expect(harness.adapter.assertWrite(ready, 'create', ctx)).rejects.toThrow(ForbiddenException);
    },
  );

  it('denies person review when neither participation write action is permitted', async () => {
    const harness = createHarness();
    harness.people.match.mockResolvedValue({ reviewIds: ['person-1'], message: 'Revisar dados.' });
    harness.authorization.assertPermissions.mockImplementation(async (_actor, permissions) => {
      if (permissions.includes(Permission.Subscription.Create) || permissions.includes(Permission.Subscription.Update))
        throw new ForbiddenException();
    });
    const resource = participationResource('event-subscription', 'source-participation', {
      eventId: 'event-1',
      person: { name: 'Ana Silva' },
    });
    await expect(harness.adapter.resolve(resource, context(activeEventTransaction()))).rejects.toThrow(
      ForbiddenException,
    );
    expect(harness.people.reviewCandidates).not.toHaveBeenCalled();
  });

  it('authorizes the target before resolving a person and never creates one', async () => {
    const order: string[] = [];
    const harness = createHarness();
    harness.authorization.assertPermissions.mockImplementation(async () => {
      order.push('authorize');
    });
    harness.people.match.mockImplementation(async () => {
      order.push('match-person');
      return { id: 'person-1' };
    });
    const tx = activeEventTransaction();
    (tx.event as { findFirst: jest.Mock }).findFirst.mockImplementation(async () => {
      order.push('target-lookup');
      return { id: 'event-1' };
    });
    (tx.eventSubscription as { findFirst: jest.Mock }).findFirst.mockResolvedValue(null);
    const resource = participationResource('event-subscription', 'source-subscription', {
      eventId: 'event-1',
      person: { email: 'ada@example.com' },
    });

    const resolved = await harness.adapter.resolve(resource, context(tx));

    expect(order.indexOf('match-person')).toBeGreaterThan(order.lastIndexOf('authorize'));
    expect(harness.people.match).toHaveBeenCalledWith({ email: 'ada@example.com' }, tx);
    expect('personId' in resolved && resolved.personId).toBe('person-1');
    expect((tx as { people?: { create?: jest.Mock } }).people?.create).toBeUndefined();
  });

  it('requires confirmation and additional data without writing during resolution', async () => {
    const harness = createHarness();
    harness.people.match.mockResolvedValue({ missing: true, message: 'Não encontrada.' });
    const tx = activeEventTransaction({ people: { create: jest.fn() } });
    const reference = { name: 'Ana Silva' };
    const resource = participationResource('event-subscription', 'subscription-new', {
      eventId: 'event-1',
      person: reference,
    });
    const pending = await harness.adapter.resolve(resource, context(tx));
    expect(pending.personPrompt).toMatchObject({ key: transferPersonKey(reference), data: reference });
    const ctx = context(tx);
    ctx.personDecisions = [{ key: transferPersonKey(reference), action: 'create', data: reference }];
    expect((await harness.adapter.resolve(resource, ctx)).personCreation).toBeUndefined();
    ctx.personDecisions = [{ key: transferPersonKey(reference), action: 'create', data: { email: 'ana@example.com' } }];
    const ready = await harness.adapter.resolve(resource, ctx);
    expect(ready.personCreation).toMatchObject({ data: { name: 'Ana Silva', email: 'ana@example.com' } });
    expect(harness.authorization.assertPermissions).toHaveBeenCalledWith(actor, [Permission.Person.Create]);
    expect((tx.people as { create: jest.Mock }).create).not.toHaveBeenCalled();
  });

  it('reviews changed email against matching names and merges using the existing secondary-email rules', async () => {
    const harness = createHarness();
    harness.people.match.mockResolvedValue({ reviewIds: ['person-1'], message: 'Dados diferentes.' });
    harness.people.reviewCandidates.mockResolvedValue([
      {
        id: 'person-1',
        name: 'Ana Silva',
        email: 'old@example.com',
        secondaryEmails: ['other@example.com'],
        phone: null,
        identityDocument: null,
        academicId: null,
        updatedAt: new Date(),
      },
    ]);
    const reference = { name: 'Ana Silva', email: 'new@example.com' };
    const resource = participationResource('event-subscription', 'subscription-new', {
      eventId: 'event-1',
      person: reference,
    });
    const ctx = context(activeEventTransaction());
    const pending = await harness.adapter.resolve(resource, ctx);
    expect(pending.personPrompt?.candidates).toMatchObject([{ id: 'person-1', email: 'old@example.com' }]);
    ctx.personDecisions = [
      {
        key: transferPersonKey(reference),
        action: 'merge',
        personId: 'person-1',
        data: {},
        reviewHash: pending.personPrompt?.reviewHash,
      },
    ];
    const ready = await harness.adapter.resolve(resource, ctx);
    expect(ready.personMerge?.data.secondaryEmails).toEqual(['other@example.com', 'new@example.com']);
    expect(ready.personMerge?.data).not.toHaveProperty('email');
    expect(ready.personCreation).toBeUndefined();
    expect(harness.authorization.assertPermissions).toHaveBeenCalledWith(actor, [Permission.Person.Update]);
    harness.people.hasReservedIdentity.mockResolvedValue(true);
    expect((await harness.adapter.resolve(resource, ctx)).personMerge).toBeUndefined();
  });

  it.each([
    { field: 'phone', current: '+5518912345678', proposed: '+5518912345679' },
    { field: 'phone', current: null, proposed: '+5518912345679' },
    { field: 'identityDocument', current: null, proposed: '52998224725' },
    { field: 'academicId', current: null, proposed: 'RA123' },
  ])('blocks changing account-managed $field data during a merge ($current)', async ({ field, current, proposed }) => {
    const harness = createHarness();
    harness.people.match.mockResolvedValue({ reviewIds: ['person-1'], message: 'Revisar.' });
    harness.people.reviewCandidates.mockResolvedValue([
      {
        id: 'person-1',
        name: 'Ana Silva',
        email: 'old@example.com',
        secondaryEmails: [],
        phone: null,
        identityDocument: null,
        academicId: null,
        [field]: current,
        userId: 'linked-user',
        updatedAt: new Date(),
      },
    ]);
    const reference = { name: 'Ana Silva', email: 'new@example.com' };
    const resource = participationResource('event-subscription', 'subscription-new', {
      eventId: 'event-1',
      person: reference,
    });
    const ctx = context(activeEventTransaction());
    const pending = await harness.adapter.resolve(resource, ctx);
    ctx.personDecisions = [
      {
        key: transferPersonKey(reference),
        action: 'merge',
        personId: 'person-1',
        data: { [field]: proposed },
        reviewHash: pending.personPrompt?.reviewHash,
      },
    ];

    const resolved = await harness.adapter.resolve(resource, ctx);

    expect(resolved.personMerge).toBeUndefined();
    expect(resolved.personPrompt?.message).toContain('vinculada a uma conta');
  });

  it('preserves linked-account fields while merging a secondary email with equivalent identifiers', async () => {
    const harness = createHarness();
    harness.people.match.mockResolvedValue({ reviewIds: ['person-1'], message: 'Revisar.' });
    harness.people.reviewCandidates.mockResolvedValue([
      {
        id: 'person-1',
        name: 'Ana Silva',
        email: 'old@example.com',
        secondaryEmails: [],
        phone: '(18) 91234-5678',
        identityDocument: '529.982.247-25',
        academicId: 'ra123',
        userId: 'linked-user',
        updatedAt: new Date(),
      },
    ]);
    const reference = {
      name: 'Ana Silva',
      email: 'new@example.com',
      phone: '+5518912345678',
      identityDocument: '52998224725',
      academicId: 'RA123',
    };
    const resource = participationResource('event-subscription', 'subscription-new', {
      eventId: 'event-1',
      person: reference,
    });
    const ctx = context(activeEventTransaction());
    const pending = await harness.adapter.resolve(resource, ctx);
    ctx.personDecisions = [
      {
        key: transferPersonKey(reference),
        action: 'merge',
        personId: 'person-1',
        data: {},
        reviewHash: pending.personPrompt?.reviewHash,
      },
    ];

    const resolved = await harness.adapter.resolve(resource, ctx);

    expect(resolved.personMerge?.data).toEqual({ secondaryEmails: ['new@example.com'] });
  });

  it('requires another manual review when extra form data reveals an existing name match', async () => {
    const harness = createHarness();
    harness.people.match.mockImplementation(async (reference) =>
      reference.name
        ? { reviewIds: ['existing-person'], message: 'Revisar nome.' }
        : { missing: true, message: 'Não encontrada.' },
    );
    harness.people.reviewCandidates.mockResolvedValue([
      {
        id: 'existing-person',
        name: 'Ana Silva',
        email: 'old@example.com',
        secondaryEmails: [],
        phone: null,
        identityDocument: null,
        academicId: null,
        updatedAt: new Date(),
      },
    ]);
    const reference = { email: 'new@example.com' };
    const resource = participationResource('event-subscription', 'subscription-new', {
      eventId: 'event-1',
      person: reference,
    });
    const ctx = context(activeEventTransaction());
    ctx.personDecisions = [{ key: transferPersonKey(reference), action: 'create', data: { name: 'Ana Silva' } }];
    const pending = await harness.adapter.resolve(resource, ctx);
    expect(pending.personCreation).toBeUndefined();
    expect(pending.personPrompt?.candidates).toMatchObject([{ id: 'existing-person' }]);
    expect(pending.personPrompt?.lockedFields).toEqual(['email']);
    ctx.personDecisions = [
      {
        key: transferPersonKey(reference),
        action: 'create',
        data: { name: 'Ana Silva' },
        reviewHash: pending.personPrompt?.reviewHash,
      },
    ];
    expect((await harness.adapter.resolve(resource, ctx)).personCreation).toBeDefined();
    harness.authorization.assertPermissions.mockImplementation(async (_actor, permissions) => {
      if (permissions.includes(Permission.Person.Update)) throw new ForbiddenException();
    });
    ctx.personDecisions = [
      {
        key: transferPersonKey(reference),
        action: 'merge',
        personId: 'existing-person',
        data: { name: 'Ana Silva' },
        reviewHash: pending.personPrompt?.reviewHash,
      },
    ];
    await expect(harness.adapter.resolve(resource, ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('supports an explicit new person with the same name but refuses duplicate identifiers', async () => {
    const harness = createHarness();
    harness.people.match.mockResolvedValue({ reviewIds: ['person-1'], message: 'Revisar.' });
    const reference = { name: 'Ana Silva', email: 'new@example.com' };
    const resource = participationResource('event-subscription', 'subscription-new', {
      eventId: 'event-1',
      person: reference,
    });
    const ctx = context(activeEventTransaction());
    ctx.personDecisions = [{ key: transferPersonKey(reference), action: 'create', data: {} }];
    expect((await harness.adapter.resolve(resource, ctx)).personCreation).toBeDefined();
    harness.people.hasReservedIdentity.mockResolvedValue(true);
    expect((await harness.adapter.resolve(resource, ctx)).personCreation).toBeUndefined();
  });

  it('does not offer creation without global people creation permission and supports skipping', async () => {
    const harness = createHarness();
    harness.people.match.mockResolvedValue({ missing: true, message: 'Não encontrada.' });
    harness.authorization.assertPermissions.mockImplementation(async (_actor, permissions) => {
      if (permissions.includes(Permission.Person.Create)) throw new ForbiddenException();
    });
    const reference = { name: 'Ana Silva', email: 'ana@example.com' };
    const resource = participationResource('event-subscription', 'subscription-new', {
      eventId: 'event-1',
      person: reference,
    });
    const ctx = context(activeEventTransaction());
    const blocked = await harness.adapter.resolve(resource, ctx);
    expect(blocked.personPrompt).toBeUndefined();
    expect(blocked.personCreation).toBeUndefined();
    ctx.personDecisions = [{ key: transferPersonKey(reference), action: 'skip' }];
    expect((await harness.adapter.resolve(resource, ctx)).skip?.message).toContain('sua escolha');
  });

  it('does not inspect people when the target is unauthorized', async () => {
    const harness = createHarness();
    harness.authorization.assertPermissions.mockRejectedValue(new ForbiddenException());
    const resource = participationResource('event-subscription', 'source-subscription', {
      eventId: 'event-1',
      person: { email: 'ada@example.com' },
    });

    await expect(harness.adapter.resolve(resource, context(activeEventTransaction()))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(harness.people.match).not.toHaveBeenCalled();
  });

  it('turns missing or ambiguous person matches into a non-identifying skip', async () => {
    const harness = createHarness();
    harness.people.match.mockResolvedValue({ message: 'Ambiguous match.' });
    const resource = participationResource('event-subscription', 'source-subscription', {
      eventId: 'event-1',
      person: { name: 'Ada Lovelace' },
    });

    const resolved = await harness.adapter.resolve(resource, context(activeEventTransaction()));

    expect(resolved.skip).toBeDefined();
    expect(resolved.skip?.message).toBe('Ambiguous match.');
    expect('personId' in resolved).toBe(false);
    expect('identityKey' in resolved).toBe(false);
  });

  it('resolves an existing subscription by its natural target/person key and preserves stored ID', async () => {
    const harness = createHarness();
    const existing = {
      id: 'stored-subscription',
      eventId: 'event-1',
      personId: 'person-1',
      imageLicenseAgreementAccepted: true,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
    };
    const tx = activeEventTransaction();
    (tx.eventSubscription as { findFirst: jest.Mock }).findFirst.mockResolvedValue(existing);
    const resource = participationResource('event-subscription', 'portable-subscription', {
      eventId: 'event-1',
      person: { email: 'ada@example.com' },
      imageLicenseAgreementAccepted: true,
    });

    const resolved = await harness.adapter.resolve(resource, context(tx));

    expect(resolved.identityKey).toBe('event-subscription:event-1:person-1');
    expect('storedId' in resolved && resolved.storedId).toBe('stored-subscription');
    expect(resolved.revision).toBe(
      participationRevision({
        kind: 'event-subscription',
        id: 'stored-subscription',
        data: { eventId: 'event-1', person: { id: 'person-1' }, imageLicenseAgreementAccepted: true },
      } as TransferResource),
    );
  });

  it('applies a partial subscription update without clearing omitted consent fields', async () => {
    const harness = createHarness();
    const existing = {
      id: 'stored-subscription',
      eventId: 'event-1',
      personId: 'person-1',
      imageLicenseAgreementAccepted: true,
      createdAt: new Date(),
      deletedAt: null,
    };
    const eventSubscription = {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockResolvedValue(existing),
      create: jest.fn(),
    };
    const tx = activeEventTransaction({ eventSubscription });
    const resource = participationResource('event-subscription', 'portable-subscription', {
      eventId: 'event-1',
      person: { id: 'person-1' },
    });
    const transferContext = context(tx, [resource]);
    const snapshot = await harness.adapter.resolve(resource, transferContext);
    jest.spyOn(harness.adapter, 'validate').mockResolvedValue(undefined);

    await harness.adapter.apply(snapshot, 'update', transferContext);

    expect(eventSubscription.update).toHaveBeenCalledWith({ where: { id: 'stored-subscription' }, data: {} });
    expect(eventSubscription.create).not.toHaveBeenCalled();
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'stored-subscription', before: expect.any(Object) }),
      tx,
    );
  });

  it('rejects a subscription ID already owned by another person or target', async () => {
    const harness = createHarness();
    const tx = activeEventTransaction();
    (tx.eventSubscription as { findUnique: jest.Mock }).findUnique.mockResolvedValue({
      eventId: 'event-2',
      personId: 'another-person',
      deletedAt: null,
    });
    const resource = participationResource('event-subscription', 'claimed-subscription', {
      eventId: 'event-1',
      person: { email: 'ada@example.com' },
    });

    await expect(harness.adapter.resolve(resource, context(tx))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(['event-attendance', 'event-subscription', 'group-subscription', 'major-event-subscription'] as const)(
    'exports portable, authorized person identifiers for %s without tying matching to source person IDs',
    async (kind) => {
      const harness = createHarness();
      const person = {
        id: 'source-person',
        name: 'Ana Silva',
        email: 'ana@example.test',
        phone: '18999999999',
        academicId: '123',
        identityDocument: '12345678901',
      };
      const row = {
        id: 'subscription-1',
        personId: person.id,
        eventId: 'event-1',
        eventGroupId: 'group-1',
        majorEventId: 'major-1',
        attendedAt: new Date(),
        status: 'VALID',
        imageLicenseAgreementAccepted: true,
        subscriptionStatus: 'CONFIRMED',
        amountPaid: null,
        paymentDate: null,
        paymentTier: null,
        selectedEvents: [],
      };
      const tx = {
        event: { findFirst: jest.fn().mockResolvedValue({ id: 'event-1' }) },
        eventGroup: { findFirst: jest.fn().mockResolvedValue({ id: 'group-1' }) },
        majorEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'major-1' }) },
        eventAttendance: { findMany: jest.fn().mockResolvedValue([row]) },
        eventSubscription: { findMany: jest.fn().mockResolvedValue([row]) },
        eventGroupSubscription: { findMany: jest.fn().mockResolvedValue([row]) },
        majorEventSubscription: { findMany: jest.fn().mockResolvedValue([row]) },
        people: { findMany: jest.fn().mockResolvedValue([person]) },
      };
      const target =
        kind === 'major-event-subscription'
          ? { kind: 'major-event' as const, id: 'major-1' }
          : kind === 'group-subscription'
            ? { kind: 'group' as const, id: 'group-1' }
            : { kind: 'event' as const, id: 'event-1' };
      const options = {
        includeDescendants: false,
        includeConfiguration: false,
        includeSubscriptions: kind !== 'event-attendance',
        includeAttendances: kind === 'event-attendance',
      };
      const exported = await harness.adapter.exportTarget(target, options, context(tx));
      const resource = exported.resources[0];
      expect(resource?.kind).toBe(kind);
      expect(resource?.data).toHaveProperty('person', {
        name: person.name,
        email: person.email,
        phone: person.phone,
        academicId: person.academicId,
        identityDocument: person.identityDocument,
      });
      expect(resource?.revision).toBe(
        participationRevision({
          ...resource,
          data: { ...resource?.data, person: { id: person.id } },
        } as TransferResource),
      );
      expect(harness.authorization.assertPermissions).toHaveBeenCalledWith(
        actor,
        [kind === 'event-attendance' ? Permission.EventAttendance.Read : Permission.Subscription.Read],
        expect.any(Object),
      );

      harness.authorization.assertPermissions.mockRejectedValue(new ForbiddenException());
      tx.people.findMany.mockClear();
      expect((await harness.adapter.exportTarget(target, options, context(tx))).resources).toEqual([]);
      expect(tx.people.findMany).not.toHaveBeenCalled();
    },
  );

  it('exports parent subscriptions independently from child subscriptions', async () => {
    const harness = createHarness();
    const tx = {
      people: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'person-1',
            name: 'Ana Silva',
            email: 'ana@example.test',
            phone: null,
            academicId: null,
            identityDocument: null,
          },
        ]),
      },
      majorEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'major-1' }) },
      majorEventSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'major-subscription-1',
            majorEventId: 'major-1',
            personId: 'person-1',
            imageLicenseAgreementAccepted: true,
            subscriptionStatus: 'CONFIRMED',
            amountPaid: null,
            paymentDate: null,
            paymentTier: null,
            selectedEvents: [],
          },
        ]),
      },
      event: { findMany: jest.fn().mockResolvedValue([]) },
      eventSubscription: { findMany: jest.fn().mockResolvedValue([]) },
      eventGroup: { findMany: jest.fn().mockResolvedValue([]) },
      eventGroupSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const exported = await harness.adapter.exportTarget(
      { kind: 'major-event', id: 'major-1' },
      {
        includeDescendants: true,
        includeConfiguration: true,
        includeSubscriptions: true,
        includeAttendances: false,
        includeChildSubscriptions: false,
        includeChildAttendances: false,
      },
      context(tx),
    );

    expect(exported.resources.map((resource) => resource.kind)).toEqual(['major-event-subscription']);
    expect(exported.resources[0]?.data).toHaveProperty('person', { name: 'Ana Silva', email: 'ana@example.test' });
    expect(tx.event.findMany).not.toHaveBeenCalled();
    expect(tx.eventSubscription.findMany).not.toHaveBeenCalled();
    expect(tx.eventGroupSubscription.findMany).not.toHaveBeenCalled();
  });

  it('exports child subscriptions only when the child option is selected', async () => {
    const harness = createHarness();
    const tx = {
      people: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'person-1',
            name: 'Ana Silva',
            email: 'ana@example.test',
            phone: null,
            academicId: null,
            identityDocument: null,
          },
        ]),
      },
      majorEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'major-1' }) },
      event: {
        findFirst: jest.fn().mockResolvedValue({ id: 'event-1' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'event-1' }]),
      },
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'event-subscription-1',
            eventId: 'event-1',
            personId: 'person-1',
            imageLicenseAgreementAccepted: true,
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            deletedAt: null,
          },
        ]),
      },
      eventAttendance: { findMany: jest.fn().mockResolvedValue([]) },
      eventGroup: { findMany: jest.fn().mockResolvedValue([]) },
      eventGroupSubscription: { findMany: jest.fn().mockResolvedValue([]) },
      majorEventSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const exported = await harness.adapter.exportTarget(
      { kind: 'major-event', id: 'major-1' },
      {
        includeDescendants: true,
        includeConfiguration: true,
        includeSubscriptions: false,
        includeAttendances: false,
        includeChildSubscriptions: true,
        includeChildAttendances: false,
      },
      context(tx),
    );

    expect(exported.resources.map((resource) => resource.kind)).toEqual(['event-subscription']);
    expect(tx.eventSubscription.findMany).toHaveBeenCalled();
    expect(tx.majorEventSubscription.findMany).not.toHaveBeenCalled();
    expect(tx.eventAttendance.findMany).not.toHaveBeenCalled();
  });

  it('rejects subscriptions to sports matches through the domain rule path', async () => {
    const harness = createHarness();
    const tx = activeEventTransaction({
      eventLecturer: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    (tx.event as { findFirst: jest.Mock }).findFirst.mockImplementation(
      async (args: { select?: Record<string, unknown> }) => {
        if (args.select?.['sportsMatch']) return { sportsMatch: { id: 'match-1' } };
        return { id: 'event-1' };
      },
    );
    const resource = participationResource('event-subscription', 'subscription-1', {
      eventId: 'event-1',
      person: { id: 'person-1' },
    });
    const snapshot = {
      resource,
      current: null,
      revision: null,
      personId: 'person-1',
      storedId: undefined,
      target: { kind: 'event', id: 'event-1' },
      scope: { eventId: 'event-1' },
      dependencies: [{ kind: 'event', id: 'event-1' }],
    } as never;

    await expect(harness.adapter.validate(snapshot, context(tx))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('previews sports check-in, requires match and ticket rights, and checks frozen backing parents', async () => {
    const harness = createHarness();
    const match = {
      id: 'match-1',
      state: 'SCHEDULED',
      canonicalState: 'SCHEDULED',
      revision: 7,
      event: { eventGroupId: 'group-1', majorEventId: null, eventGroup: { majorEventId: 'major-1' } },
      category: { eventGroupId: 'group-1', tournament: { majorEventId: 'major-1' } },
    };
    const tx = activeEventTransaction({
      event: {
        findFirst: jest.fn().mockResolvedValue({ id: 'event-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      eventAttendance: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      sportsMatch: { findFirst: jest.fn().mockResolvedValue(match), updateMany: jest.fn() },
      sportsMatchRosterEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'roster-entry-1' }) },
      ticketConfig: { findUnique: jest.fn().mockResolvedValue({ enabled: true }) },
    });
    const resource = participationResource('event-attendance', 'reserved-attendance-id', {
      eventId: 'event-1',
      person: { id: 'person-1' },
      attendedAt: new Date().toISOString(),
      status: 'PRESENT',
    });
    const transferContext = context(tx);

    const snapshot = await harness.adapter.resolve(resource, transferContext);
    expect(snapshot.resolvedId).toBe('event-1:person-1');
    await harness.adapter.assertRead(snapshot, transferContext);
    await harness.adapter.assertWrite(snapshot, 'create', transferContext);
    await harness.adapter.assertMutable(snapshot, 'edit', transferContext);

    expect(snapshot.additionalChanges).toEqual(
      expect.arrayContaining([
        {
          field: 'Estado da partida após presença de atleta',
          before: { state: 'SCHEDULED', revision: 7 },
          after: { state: 'CHECK_IN', revision: 8 },
        },
        expect.objectContaining({ field: 'Bilhetes do evento' }),
        expect.objectContaining({ field: 'Avaliação derivada da presença' }),
      ]),
    );
    expect(harness.authorization.assertPermissions).toHaveBeenCalledWith(actor, [Permission.SportsMatch.Read], {
      sportsMatchId: 'match-1',
    });
    expect(harness.authorization.assertPermissions).toHaveBeenCalledWith(actor, [Permission.SportsMatch.Operate], {
      sportsMatchId: 'match-1',
    });
    expect(harness.authorization.assertPermissions).toHaveBeenCalledWith(actor, [Permission.Ticket.Read], {
      eventId: 'event-1',
    });
    expect(harness.authorization.assertPermissions).toHaveBeenCalledWith(actor, [Permission.Ticket.Issue], {
      eventId: 'event-1',
    });
    expect(transferContext.frozenResources.assertEventMutable).toHaveBeenCalledWith('event-1', actor, 'edit');
    expect(transferContext.frozenResources.assertEventGroupMutable).toHaveBeenCalledWith('group-1', actor, 'edit');
    expect(transferContext.frozenResources.assertMajorEventMutable).toHaveBeenCalledWith('major-1', actor, 'edit');
    expect((tx.sportsMatch as { updateMany: jest.Mock }).updateMany).not.toHaveBeenCalled();
  });

  it.each([
    { storedStatus: 'ABSENT', proposedStatus: undefined, recordsPresence: false },
    { storedStatus: 'PRESENT', proposedStatus: undefined, recordsPresence: true },
    { storedStatus: 'ABSENT', proposedStatus: 'PRESENT', recordsPresence: true },
    { storedStatus: 'PRESENT', proposedStatus: 'ABSENT', recordsPresence: false },
  ] as const)(
    'uses the effective attendance status for sports and tickets: %o',
    async ({ storedStatus, proposedStatus, recordsPresence }) => {
      const harness = createHarness();
      const attendedAt = new Date();
      const existing = { personId: 'person-1', eventId: 'event-1', attendedAt, status: storedStatus };
      const match = {
        id: 'match-1',
        state: 'SCHEDULED',
        canonicalState: 'SCHEDULED',
        revision: 7,
        event: { eventGroupId: 'group-1', majorEventId: 'major-1', eventGroup: null },
        category: { eventGroupId: 'group-1', tournament: { majorEventId: 'major-1' } },
      };
      const attendance = {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(existing),
      };
      const sportsMatch = {
        findFirst: jest.fn().mockResolvedValue(match),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
      const tx = activeEventTransaction({
        eventAttendance: attendance,
        sportsMatch,
        sportsMatchRosterEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'roster-1' }) },
        ticketConfig: { findUnique: jest.fn().mockResolvedValue({ enabled: true }) },
      });
      const resource = participationResource('event-attendance', 'event-1:person-1', {
        eventId: 'event-1',
        person: { id: 'person-1' },
        attendedAt: new Date(attendedAt.getTime() + 60_000).toISOString(),
        ...(proposedStatus ? { status: proposedStatus } : {}),
      });
      const transferContext = context(tx, [resource]);
      const snapshot = await harness.adapter.resolve(resource, transferContext);

      const changes = snapshot.additionalChanges ?? [];
      expect(changes.some(({ field }) => field === 'Estado da partida após presença de atleta')).toBe(recordsPresence);
      expect(changes.some(({ field }) => field === 'Bilhetes do evento')).toBe(recordsPresence);
      await harness.adapter.apply(snapshot, 'update', transferContext);
      expect(sportsMatch.updateMany).toHaveBeenCalledTimes(recordsPresence ? 1 : 0);
      expect(harness.categories.refreshForAttendance).toHaveBeenCalledWith('person-1', 'event-1', tx, recordsPresence);
      const requestedPermissions = harness.authorization.assertPermissions.mock.calls.flatMap(
        ([, permissions]) => permissions,
      );
      expect(requestedPermissions.includes(Permission.SportsMatch.Operate)).toBe(recordsPresence);
      expect(requestedPermissions.includes(Permission.Ticket.Read)).toBe(recordsPresence);
      expect(requestedPermissions.includes(Permission.Ticket.Issue)).toBe(recordsPresence);
      const update = attendance.update.mock.calls[0]?.[0].data as Record<string, unknown>;
      if (proposedStatus) expect(update['status']).toBe(proposedStatus);
      else expect(update).not.toHaveProperty('status');
    },
  );

  it('creates a sports attendance with the default present status and its planned check-in', async () => {
    const harness = createHarness();
    const attendance = { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) };
    const sportsMatch = {
      findFirst: jest.fn().mockResolvedValue({
        id: 'match-1',
        state: 'SCHEDULED',
        canonicalState: 'SCHEDULED',
        revision: 7,
        event: { eventGroupId: 'group-1', majorEventId: 'major-1', eventGroup: null },
        category: { eventGroupId: 'group-1', tournament: { majorEventId: 'major-1' } },
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const tx = activeEventTransaction({
      eventAttendance: attendance,
      sportsMatch,
      sportsMatchRosterEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'roster-1' }) },
    });
    const resource = participationResource('event-attendance', 'event-1:person-1', {
      eventId: 'event-1',
      person: { id: 'person-1' },
      attendedAt: new Date().toISOString(),
    });
    const transferContext = context(tx, [resource]);
    const snapshot = await harness.adapter.resolve(resource, transferContext);

    await expect(harness.adapter.apply(snapshot, 'create', transferContext)).resolves.toBeDefined();
    expect(attendance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ personId: 'person-1', eventId: 'event-1' }),
    });
    expect(sportsMatch.updateMany).toHaveBeenCalledTimes(1);
    expect(harness.categories.refreshForAttendance).toHaveBeenCalledWith('person-1', 'event-1', tx, true);
  });

  it('does not resolve a person for a sports attendance when the match is not readable', async () => {
    const harness = createHarness();
    const tx = activeEventTransaction({
      sportsMatch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'match-1',
          state: 'SCHEDULED',
          canonicalState: 'SCHEDULED',
          revision: 2,
          event: { eventGroupId: null, majorEventId: 'major-1', eventGroup: null },
          category: { eventGroupId: null, tournament: { majorEventId: 'major-1' } },
        }),
      },
    });
    harness.authorization.assertPermissions.mockImplementation(async (_user, permissions) => {
      if (permissions.includes(Permission.SportsMatch.Read)) throw new ForbiddenException();
    });
    const resource = participationResource('event-attendance', 'event-1:person-1', {
      eventId: 'event-1',
      person: { id: 'person-1' },
      attendedAt: new Date().toISOString(),
      status: 'PRESENT',
    });

    await expect(harness.adapter.resolve(resource, context(tx))).rejects.toBeInstanceOf(ForbiddenException);
    expect(harness.people.match).not.toHaveBeenCalled();
  });

  it('blocks selected events outside the major event', async () => {
    const harness = createHarness();
    const foreignEvent = {
      kind: 'event',
      id: 'event-foreign',
      data: { majorEventId: 'major-2' },
    } as TransferResource;
    const tx = {
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'major-1', isPaymentRequired: false, majorEventPrices: [] }),
      },
      event: {
        findFirst: jest.fn(async (args: { where?: Record<string, unknown> }) =>
          args.where?.['majorEventId'] === 'major-1' ? null : null,
        ),
        findUnique: jest.fn().mockResolvedValue({ id: 'event-foreign' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      eventLecturer: { findUnique: jest.fn().mockResolvedValue(null) },
      eventSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const resource = participationResource('major-event-subscription', 'subscription-1', {
      majorEventId: 'major-1',
      person: { id: 'person-1' },
      subscriptionStatus: 'CONFIRMED',
      paymentTier: 'Standard',
      selectedEventIds: ['event-foreign'],
    });
    const snapshot = {
      resource,
      current: null,
      revision: null,
      personId: 'person-1',
      target: { kind: 'major-event', id: 'major-1' },
      scope: { majorEventId: 'major-1' },
      dependencies: [
        { kind: 'major-event', id: 'major-1' },
        { kind: 'event', id: 'event-foreign' },
      ],
    } as never;

    await expect(harness.adapter.validate(snapshot, context(tx, [foreignEvent]))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a tier-restricted selection that the payment tier does not allow', async () => {
    const harness = createHarness();
    const tx = {
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'major-1',
          isPaymentRequired: true,
          maxCoursesPerAttendee: null,
          maxLecturesPerAttendee: null,
          maxUncategorizedPerAttendee: null,
          majorEventPrices: [
            {
              tiers: [
                { name: 'Basic', includesEventRegistration: true, restrictEventSelection: true, allowedEventIds: [] },
              ],
            },
          ],
        }),
      },
      event: {
        findFirst: jest.fn().mockResolvedValue({ id: 'event-1' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'event-1', type: 'PALESTRA', eventGroupId: null }]),
      },
      eventLecturer: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const resource = participationResource('major-event-subscription', 'subscription-1', {
      majorEventId: 'major-1',
      person: { id: 'person-1' },
      paymentTier: 'Basic',
      subscriptionStatus: 'CONFIRMED',
      selectedEventIds: ['event-1'],
    });
    const snapshot = {
      resource,
      current: null,
      revision: null,
      personId: 'person-1',
      target: { kind: 'major-event', id: 'major-1' },
      scope: { majorEventId: 'major-1' },
      dependencies: [
        { kind: 'major-event', id: 'major-1' },
        { kind: 'event', id: 'event-1' },
      ],
    } as never;

    await expect(harness.adapter.validate(snapshot, context(tx))).rejects.toThrow(
      'O evento event-1 não é permitido para a faixa selecionada.',
    );
  });

  it('includes the affected event set in the preview for a new group subscription', async () => {
    const harness = createHarness();
    const tx = {
      eventGroup: { findFirst: jest.fn().mockResolvedValue({ id: 'group-1' }) },
      event: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'event-1', majorEventId: null, eventGroup: null, sportsMatch: null }),
        findMany: jest.fn().mockResolvedValue([{ id: 'event-1', slots: null }]),
        findUnique: jest.fn().mockResolvedValue({ id: 'event-1' }),
      },
      eventLecturer: { findUnique: jest.fn().mockResolvedValue(null) },
      eventSubscription: { findFirst: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0) },
      majorEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const resource = participationResource('group-subscription', 'group-subscription-1', {
      eventGroupId: 'group-1',
      person: { id: 'person-1' },
    });
    const snapshot = {
      resource,
      current: null,
      revision: null,
      personId: 'person-1',
      target: { kind: 'group', id: 'group-1' },
      scope: { eventGroupId: 'group-1' },
      dependencies: [{ kind: 'group', id: 'group-1' }],
    } as unknown as ResolvedTransferResource;

    await harness.adapter.validate(snapshot, context(tx));

    expect(snapshot.additionalChanges).toEqual([
      { field: 'Inscrições nos eventos do grupo', before: [], after: ['event-1'] },
    ]);
  });

  it('reports selected-event synchronization changes on an existing major subscription', async () => {
    const harness = createHarness();
    const tx = {
      majorEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'major-1' }) },
      majorEventSubscription: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({
          id: 'stored-subscription',
          majorEventId: 'major-1',
          personId: 'person-1',
          imageLicenseAgreementAccepted: true,
          subscriptionStatus: 'CONFIRMED',
          amountPaid: null,
          paymentDate: null,
          paymentTier: null,
          selectedEvents: [{ eventId: 'event-before' }],
        }),
      },
    };
    const resource = participationResource('major-event-subscription', 'portable-subscription', {
      majorEventId: 'major-1',
      person: { id: 'person-1' },
      selectedEventIds: ['event-after'],
    });

    const snapshot = await harness.adapter.resolve(resource, context(tx));

    expect(snapshot.additionalChanges).toEqual([
      { field: 'Inscrições nos eventos selecionados', before: ['event-before'], after: ['event-after'] },
    ]);
  });

  it('depends on a same-file price tier referenced by a major subscription payment label', async () => {
    const harness = createHarness();
    const majorSubscription = participationResource('major-event-subscription', 'subscription-new', {
      majorEventId: 'major-1',
      person: { id: 'person-1' },
      paymentTier: 'Gold',
    });
    const priceTable = {
      kind: 'major-event-price',
      id: 'price-1',
      data: { majorEventId: 'major-1', type: 'TIERED' },
    } as TransferResource;
    const tier = {
      kind: 'price-tier',
      id: 'tier-gold',
      data: { priceId: 'price-1', name: 'Gold', value: 100 },
    } as TransferResource;
    const tx = {
      majorEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'major-1' }) },
      majorEventSubscription: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const snapshot = await harness.adapter.resolve(
      majorSubscription,
      context(tx, [majorSubscription, priceTable, tier]),
    );

    expect(snapshot.dependencies).toContainEqual({ kind: 'price-tier', id: 'tier-gold' });
  });
});

describe('PersonTransferMatcherService', () => {
  it('uses the CSV matcher normalization for case-insensitive email without creating people', async () => {
    const matcher = new PersonTransferMatcherService({} as never);
    const person = {
      id: 'person-1',
      name: 'Ada Lovelace',
      email: 'Ada@Example.com',
      secondaryEmails: [],
      phone: null,
      identityDocument: null,
      academicId: null,
      userId: null,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    };
    const tx = { people: { findMany: jest.fn().mockResolvedValue([person]), create: jest.fn() } };

    await expect(matcher.match({ email: ' ADA@EXAMPLE.COM ' }, tx as never)).resolves.toEqual({ id: 'person-1' });
    expect(tx.people.findMany).toHaveBeenCalledTimes(1);
    expect(tx.people.create).not.toHaveBeenCalled();
  });

  it('rejects ambiguous and inconsistent identifiers rather than choosing or creating a person', async () => {
    const matcher = new PersonTransferMatcherService({} as never);
    const first = {
      id: 'person-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      secondaryEmails: [],
      phone: null,
      identityDocument: null,
      academicId: null,
      userId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const second = { ...first, id: 'person-2' };
    const ambiguousTx = { people: { findMany: jest.fn().mockResolvedValue([first, second]), create: jest.fn() } };

    const ambiguous = await matcher.match({ email: 'ada@example.com' }, ambiguousTx as never);

    expect('message' in ambiguous).toBe(true);
    expect(ambiguousTx.people.create).not.toHaveBeenCalled();

    const inconsistentTx = {
      people: {
        findMany: jest.fn().mockResolvedValueOnce([first]).mockResolvedValueOnce([second]),
        create: jest.fn(),
      },
    };
    const inconsistent = await matcher.match({ id: 'person-1', email: 'ada@example.com' }, inconsistentTx as never);
    expect('message' in inconsistent).toBe(true);
    expect(inconsistentTx.people.create).not.toHaveBeenCalled();
  });
});
