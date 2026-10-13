import type { TransferResource, TransferResourceKind } from '@cacic-fct/shared-data-transfer';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { diffResourceData } from './data-transfer.service';
import type { ResolvedTransferResource, TransferAdapterContext } from './data-transfer-adapter';
import { ConfigurationTransferAdapter } from './configuration-transfer.adapter';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { DataTransferService } from './data-transfer.service';
import { TransferKeyAllocations } from './transfer-key-allocations';
import { SportsDataTransferAdapter } from './sports-data-transfer.adapter';

describe('ConfigurationTransferAdapter', () => {
  it('reads normalized persisted form values for a reusable apply result', async () => {
    const now = new Date();
    let stored: Record<string, unknown> | null = null;
    const tx = {
      event: { findFirst: jest.fn().mockResolvedValue({ id: 'event-1', majorEventId: null, eventGroupId: null }) },
      eventForm: {
        findFirst: jest.fn(async () => stored),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          stored = {
            ownerMajorEventId: null,
            sigilo: 'SECRET',
            responseMode: 'ONE_PER_TARGET',
            resultsPublic: false,
            resultsLive: false,
            allowResponseEdits: false,
            updatedAt: now,
            deletedAt: null,
            ...data,
          };
          return stored;
        }),
      },
    };
    const adapter = createAdapter(tx);
    const resource = transferResource('event-form', 'form-1', {
      ownerEventId: 'event-1',
      name: '  Inscrição  ',
      description: '  ',
      elements: [],
    });
    const context = createContext(tx, [resource]);
    const snapshot = await adapter.resolve(resource, context);
    await adapter.apply(snapshot, 'create', context);
    const applied = await adapter.readAppliedResource(snapshot, context);
    expect(applied.data).toMatchObject({ name: 'Inscrição', description: null, elements: [] });
    const fresh = await adapter.resolve(applied, context);
    expect(diffResourceData(fresh.current, applied)).toEqual([]);
  });

  it('preserves stored image references when importing a form element without image metadata', async () => {
    const now = new Date();
    const element = {
      id: 'question-1',
      type: 'shortText',
      title: 'Name',
      required: false,
      options: [],
    };
    const stored = {
      id: 'form-1',
      updatedAt: now,
      deletedAt: null,
      name: 'Feedback',
      description: null,
      elements: [{ ...element, descriptionImages: [{ id: 'image-1', altText: 'Logo' }] }],
      ownerEventId: 'event-1',
      ownerMajorEventId: null,
      sigilo: 'SECRET',
      responseMode: 'ONE_PER_TARGET',
      resultsPublic: false,
      resultsLive: false,
      allowResponseEdits: false,
      descriptionImages: [{ id: 'form-image-1', altText: 'Banner' }],
    };
    const tx = {
      event: {
        findFirst: jest.fn().mockResolvedValue({ id: 'event-1', eventGroupId: null, majorEventId: null }),
      },
      eventForm: {
        findFirst: jest.fn().mockResolvedValue(stored),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const adapter = createAdapter(tx);
    const resource = transferResource('event-form', 'form-1', {
      ownerEventId: 'event-1',
      elements: [element],
    });
    const context = createContext(tx, [resource]);
    const snapshot = await adapter.resolve(resource, context);

    await adapter.apply(snapshot, 'update', context);

    const written = tx.eventForm.updateMany.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(written['elements']).toEqual([{ ...element, descriptionImages: [{ id: 'image-1', altText: 'Logo' }] }]);
    expect(written).not.toHaveProperty('descriptionImages');
  });

  it('creates and updates place presets with normalized fields and a guarded revision', async () => {
    const now = new Date();
    let stored: Record<string, unknown> | null = null;
    const placePreset = {
      findUnique: jest.fn(async () => stored),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        stored = { ...data, deletedAt: null, updatedAt: now };
        return stored;
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const authorization = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const tx = { placePreset, authorization, audit };
    const adapter = createAdapter(tx);
    const resource = transferResource('place-preset', 'place-1', {
      name: '  Ginásio  ',
      latitude: -22,
      longitude: -51,
      locationDescription: '  Bloco A  ',
    });
    const context = createContext(tx, [resource]);
    const created = await adapter.resolve(resource, context);
    await adapter.assertRead(created, context);
    await adapter.assertWrite(created, 'create', context);
    await adapter.validate(created, context);
    await adapter.apply(created, 'create', context);
    expect(placePreset.create).toHaveBeenCalledWith({
      data: {
        id: 'place-1',
        name: 'Ginásio',
        latitude: -22,
        longitude: -51,
        locationDescription: 'Bloco A',
        createdById: context.actor.sub,
        updatedById: context.actor.sub,
      },
    });
    expect(authorization.assertPermissions).toHaveBeenCalledWith(
      context.actor,
      [Permission.DataTransfer.Import, Permission.PlacePreset.Create],
      {},
    );
    const update = transferResource('place-preset', 'place-1', { name: 'Ginásio novo', locationDescription: null });
    const updated = await adapter.resolve(update, createContext(tx, [update]));
    await adapter.assertWrite(updated, 'update', context);
    await adapter.apply(updated, 'update', context);
    expect(placePreset.updateMany).toHaveBeenCalledWith({
      where: { id: 'place-1', deletedAt: null, updatedAt: now },
      data: { name: 'Ginásio novo', locationDescription: null, updatedById: context.actor.sub },
    });
    expect(authorization.assertPermissions).toHaveBeenCalledWith(
      context.actor,
      [Permission.DataTransfer.Import, Permission.PlacePreset.Update],
      {},
    );
    placePreset.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(adapter.apply(updated, 'update', context)).rejects.toThrow(ConflictException);
    expect(audit.record).toHaveBeenCalledTimes(2);
  });

  it('rejects deleted places and new places without a nonblank name', async () => {
    const tx = { placePreset: { findUnique: jest.fn().mockResolvedValue({ deletedAt: new Date() }) } };
    const adapter = createAdapter(tx);
    const resource = transferResource('place-preset', 'place-1', { name: ' ' });
    const context = createContext(tx, [resource]);
    await expect(adapter.resolve(resource, context)).rejects.toThrow(NotFoundException);
    tx.placePreset.findUnique.mockResolvedValue(null);
    const snapshot = await adapter.resolve(resource, context);
    await expect(adapter.validate(snapshot, context)).rejects.toThrow('O local precisa ter um nome.');
  });

  it.each([false, true])(
    'keeps an exported place dependency available in a sports preview (scoped: %s)',
    async (scoped) => {
      const now = new Date();
      const place = {
        id: 'place-1',
        name: 'Ginásio',
        latitude: null,
        longitude: null,
        locationDescription: null,
        deletedAt: null,
        updatedAt: now,
      };
      const tournament = {
        id: 'tournament-1',
        majorEventId: 'major-1',
        majorEvent: { name: 'Jogos' },
        registrationStartDate: null,
        registrationEndDate: null,
        scoringMode: 'PER_SPORT',
        selfSubscriptionEnabled: false,
        selfSubscriptionAllowNoTeam: false,
        selfSubscriptionAllowNoCategory: false,
        allowPlayerMultipleTeams: false,
        shouldIssueCertificate: false,
        revision: 1,
        updatedAt: now,
      };
      const venue = {
        id: 'venue-1',
        tournamentId: tournament.id,
        tournament,
        placePresetId: place.id,
        placePreset: place,
        name: 'Quadra',
        courtLabel: null,
        capacity: null,
        notes: null,
        parentVenueId: null,
        revision: 1,
        updatedAt: now,
      };
      const authorization = {
        assertPermissions: jest.fn(
          async (_actor: AuthenticatedUser, permissions: Permission[], scope: { majorEventId?: string }) => {
            if (
              scoped &&
              permissions.some(
                (permission) =>
                  permission === Permission.DataTransfer.Import || permission === Permission.DataTransfer.Export,
              ) &&
              scope.majorEventId !== 'major-1'
            )
              throw new ForbiddenException();
            if (permissions.includes(Permission.PlacePreset.Read)) expect(scope).toEqual({});
          },
        ),
      };
      const tx = {
        placePreset: { findUnique: jest.fn().mockResolvedValue(place) },
        majorEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'major-1' }) },
        sportsTournament: { findFirst: jest.fn().mockResolvedValue(tournament) },
        sportsCategory: { findMany: jest.fn().mockResolvedValue([]) },
        sportsVenue: { findMany: jest.fn().mockResolvedValue([venue]), findFirst: jest.fn().mockResolvedValue(venue) },
      };
      const sports = new SportsDataTransferAdapter(
        tx as never,
        authorization as never,
        {} as never,
        {} as never,
        {} as never,
      );
      const target = { kind: 'major-event', id: 'major-1' } as const;
      const exported = await sports.exportTarget(
        target,
        { includeConfiguration: true, includeDescendants: true },
        createContext(tx, []),
      );
      expect(exported.resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'sports-venue' }),
          expect.objectContaining({ kind: 'place-preset' }),
        ]),
      );
      expect(exported.issues).toEqual([]);
      const configuration = createAdapter({ ...tx, authorization });
      const service = previewService(tx, [configuration, sports]);
      const preview = await service.preview(
        {
          document: { format: 'cacic-event-data', version: 1, resources: exported.resources },
          ...(scoped ? { scope: target } : {}),
        },
        createContext(tx, []).actor,
      );
      expect(preview.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'place-preset', status: 'unchanged' }),
          expect.objectContaining({ kind: 'sports-venue', status: 'unchanged' }),
        ]),
      );
      expect(preview.summary.skip).toBe(0);
      if (scoped) {
        const changed = exported.resources.map((resource) =>
          resource.kind === 'place-preset'
            ? transferResource('place-preset', resource.id, { name: 'Outro local' })
            : resource,
        );
        const blocked = await service.preview(
          { document: { format: 'cacic-event-data', version: 1, resources: changed }, scope: target },
          createContext(tx, []).actor,
        );
        expect(blocked.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ kind: 'place-preset', status: 'blocked' }),
            expect.objectContaining({ kind: 'sports-venue', status: 'blocked' }),
          ]),
        );
      }
    },
  );

  it.each([
    ['SINGLE', undefined, 'blocked'],
    ['TIERED', undefined, 'ready'],
    ['SINGLE', 'TIERED', 'ready'],
    ['TIERED', 'SINGLE', 'blocked'],
  ] as const)(
    'validates a tier against its parent %s table and proposed type %s',
    async (type, proposedType, status) => {
      const price = { id: 'price-1', majorEventId: 'major-1', type, majorEvent: { deletedAt: null } };
      const tx = {
        majorEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'major-1' }) },
        majorEventPrice: { findFirst: jest.fn().mockResolvedValue(price) },
        priceTier: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([{ id: 'existing-tier' }]),
        },
      };
      const frozen = { assertMajorEventMutable: jest.fn().mockResolvedValue(undefined) };
      const adapter = createAdapter({ ...tx, frozen });
      const tier = transferResource('price-tier', 'new-tier', { priceId: price.id, name: 'Nova faixa', value: 100 });
      const resources = [
        tier,
        ...(proposedType ? [transferResource('major-event-price', price.id, { type: proposedType })] : []),
      ];
      const context = createContext(tx, resources);
      const preview = await previewService(tx, [adapter]).preview({ document: context.document }, context.actor);
      expect(preview.items.find((item) => item.id === tier.id)).toMatchObject({ status });
      if (status === 'blocked') {
        expect(preview.canApply).toBe(false);
      } else {
        tx.priceTier.findMany.mockResolvedValue([{ id: 'existing-tier' }, { id: 'new-tier' }]);
        await expect(
          adapter.validatePlan(await adapter.resolve(tier, context), context, resources),
        ).resolves.toBeUndefined();
      }
    },
  );
  it('keeps an existing tier edit ready when an invalid new tier is skipped', async () => {
    const price = { id: 'price-1', majorEventId: 'major-1', type: 'SINGLE', majorEvent: { deletedAt: null } };
    const storedTier = {
      id: 'existing-tier',
      priceId: price.id,
      price: { majorEventId: 'major-1' },
      name: 'Regular',
      value: 100,
      includesEventRegistration: true,
      includesSportsRegistration: false,
      allowedEventIds: [],
      restrictEventSelection: false,
      customizeSubscriptionLimits: false,
      maxCoursesPerAttendee: null,
      maxLecturesPerAttendee: null,
      maxUncategorizedPerAttendee: null,
    };
    const tx = {
      majorEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'major-1' }) },
      majorEventPrice: { findFirst: jest.fn().mockResolvedValue(price) },
      priceTier: {
        findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
          where.id === storedTier.id ? storedTier : null,
        ),
        findMany: jest.fn().mockResolvedValue([{ id: storedTier.id }]),
      },
    };
    const adapter = createAdapter({ ...tx, frozen: { assertMajorEventMutable: jest.fn() } });
    const resources = [
      transferResource('price-tier', storedTier.id, { value: 200 }),
      transferResource('price-tier', 'new-tier', { priceId: price.id, name: 'Extra', value: 100 }),
    ];
    const context = createContext(tx, resources);
    const preview = await previewService(tx, [adapter]).preview({ document: context.document }, context.actor);
    expect(preview.items).toEqual([
      expect.objectContaining({ id: storedTier.id, action: 'update', status: 'ready' }),
      expect.objectContaining({ id: 'new-tier', action: 'skip', status: 'blocked' }),
    ]);
    expect(preview.canApply).toBe(true);
  });

  it.each([true, false])('authorizes new ticket options according to parent existence: %s', async (parentExists) => {
    const expected = parentExists ? Permission.TicketConfig.Update : Permission.TicketConfig.Create;
    const denied = parentExists ? Permission.TicketConfig.Create : Permission.TicketConfig.Update;
    const assertPermissions = jest.fn(async (_actor, permissions: Permission[]) => {
      if (permissions.includes(denied)) throw new ForbiddenException();
    });
    const tx = {
      ticketConfig: { findUnique: jest.fn().mockResolvedValue(parentExists ? { id: 'config-1' } : null) },
      authorization: { assertPermissions },
    };
    const resource = transferResource('ticket-price-option', 'option-new', { ticketConfigId: 'config-1' });
    const snapshot = { resource, current: null, revision: null, scope: {}, dependencies: [] };
    const adapter = createAdapter(tx);
    await expect(adapter.assertWrite(snapshot, 'create', createContext(tx, [resource]))).resolves.toBeUndefined();
    expect(assertPermissions).toHaveBeenCalledWith(expect.anything(), [Permission.DataTransfer.Import, expected], {});
    assertPermissions.mockImplementation(async (_actor, permissions: Permission[]) => {
      if (permissions.includes(expected)) throw new ForbiddenException();
    });
    await expect(adapter.assertWrite(snapshot, 'create', createContext(tx, [resource]))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('stops a stale ticket-config update before reconciling issued tickets', async () => {
    const now = new Date();
    const resource = transferResource('ticket-config', 'config-1', {
      eventId: 'event-1',
      enabled: true,
      displayName: 'Tickets',
    });
    const configRow = { id: 'config-1', updatedAt: now, eventId: 'event-1', enabled: false };
    const tx = {
      ticketConfig: {
        findFirst: jest.fn().mockResolvedValue(configRow),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: jest.fn(),
      },
      event: {
        findFirst: jest.fn().mockResolvedValue({ id: 'event-1', eventGroupId: null, majorEventId: null }),
      },
      eventTicket: { findMany: jest.fn() },
    };
    const issuance = {
      lockEventExpirationAlignment: jest.fn().mockResolvedValue(undefined),
      alignActiveTicketExpirations: jest.fn().mockResolvedValue(undefined),
      enqueueExistingSubscriptionReconciliation: jest.fn().mockResolvedValue(undefined),
    };
    const attendanceCategories = { refreshForEvent: jest.fn().mockResolvedValue(undefined) };
    const ticketRealtime = { enqueueForUsers: jest.fn().mockResolvedValue(undefined) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const adapter = createTicketTransferAdapter(tx, { issuance, attendanceCategories, ticketRealtime, audit });
    const transferContext = createContext(tx, [resource]);
    const snapshot = await adapter.resolve(resource, transferContext);

    await expect(adapter.apply(snapshot, 'update', transferContext)).rejects.toThrow(ConflictException);

    expect(tx.ticketConfig.updateMany).toHaveBeenCalledWith({
      where: { id: 'config-1', updatedAt: now },
      data: { eventId: 'event-1', enabled: true, displayName: 'Tickets' },
    });
    expect(issuance.lockEventExpirationAlignment).toHaveBeenCalledWith(tx, 'event-1', 'UPDATE');
    expect(issuance.alignActiveTicketExpirations).not.toHaveBeenCalled();
    expect(issuance.enqueueExistingSubscriptionReconciliation).not.toHaveBeenCalled();
    expect(attendanceCategories.refreshForEvent).not.toHaveBeenCalled();
    expect(tx.eventTicket.findMany).not.toHaveBeenCalled();
    expect(ticketRealtime.enqueueForUsers).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('creates a ticket option with its stable transfer ID and only portable fields', async () => {
    const resource = transferResource('ticket-price-option', 'option-stable', {
      ticketConfigId: 'config-1',
      priceTierId: 'tier-1',
      label: 'Regular',
      amountCents: 2500,
    });
    const tx = {
      ticketPriceOption: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: resource.id }),
      },
      ticketConfig: { findUnique: jest.fn().mockResolvedValue({ id: 'config-1', eventId: 'event-1' }) },
      event: { findFirst: jest.fn().mockResolvedValue({ id: 'event-1', eventGroupId: null, majorEventId: null }) },
    };
    const adapter = createTicketTransferAdapter(tx);
    const transferContext = createContext(tx, [resource]);
    const snapshot = await adapter.resolve(resource, transferContext);

    await adapter.apply(snapshot, 'create', transferContext);

    expect(tx.ticketPriceOption.create).toHaveBeenCalledWith({
      data: {
        id: 'option-stable',
        ticketConfigId: 'config-1',
        priceTierId: 'tier-1',
        label: 'Regular',
        amountCents: 2500,
      },
    });
  });

  it('updates only explicitly imported ticket-option fields under the preview revision', async () => {
    const updatedAt = new Date();
    const resource = transferResource('ticket-price-option', 'option-1', { label: 'Revised label' });
    const tx = {
      ticketPriceOption: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'option-1',
          updatedAt,
          ticketConfigId: 'config-1',
          priceTierId: 'tier-1',
          label: 'Original label',
          amountCents: 2500,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      ticketConfig: { findUnique: jest.fn().mockResolvedValue({ id: 'config-1', eventId: 'event-1' }) },
      event: { findFirst: jest.fn().mockResolvedValue({ id: 'event-1', eventGroupId: null, majorEventId: null }) },
    };
    const adapter = createTicketTransferAdapter(tx);
    const transferContext = createContext(tx, [resource]);
    const snapshot = await adapter.resolve(resource, transferContext);

    await adapter.apply(snapshot, 'update', transferContext);

    expect(tx.ticketPriceOption.updateMany).toHaveBeenCalledWith({
      where: { id: 'option-1', updatedAt },
      data: { label: 'Revised label' },
    });
  });

  it('blocks a price table and its descendants when its only proposed tier cannot apply', async () => {
    const tx = {
      majorEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'major-1' }) },
      majorEventPrice: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      priceTier: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
    };
    const frozen = { assertMajorEventMutable: jest.fn().mockResolvedValue(undefined) };
    const adapter = createAdapter({ ...tx, frozen });
    const prisma = { $transaction: jest.fn(async (operation: (value: unknown) => Promise<unknown>) => operation(tx)) };
    const journal = { findCommittedRequest: jest.fn().mockResolvedValue(null) };
    const service = new DataTransferService(
      prisma as never,
      { assertPermissions: jest.fn() } as never,
      frozen as never,
      [adapter],
      new TransferKeyAllocations(),
      journal as never,
    );
    const document = {
      format: 'cacic-event-data',
      version: 1,
      resources: [
        { kind: 'major-event-price', id: 'price-new', data: { majorEventId: 'major-1', type: 'SINGLE' } },
        { kind: 'price-tier', id: 'tier-new', data: { priceId: 'price-new', value: 100 } },
      ],
    };
    const actor = createContext(tx, []).actor;
    const preview = await service.preview({ document }, actor);
    expect(preview.items).toEqual([
      expect.objectContaining({
        kind: 'major-event-price',
        status: 'blocked',
        message: 'A tabela de preços precisa ter ao menos uma faixa.',
      }),
      expect.objectContaining({ kind: 'price-tier', status: 'blocked' }),
    ]);
    expect(preview.canApply).toBe(false);
    await expect(service.apply({ document, planHash: preview.planHash, allowPartial: true }, actor)).rejects.toThrow(
      'Não há alterações prontas',
    );
    expect(tx.majorEventPrice.create).not.toHaveBeenCalled();
  });

  it('keeps a price table executable when at least one valid tier survives a partial plan', async () => {
    const tx = {
      majorEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'major-1' }) },
      majorEventPrice: { findFirst: jest.fn().mockResolvedValue(null) },
      priceTier: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const adapter = createAdapter(tx);
    const price = transferResource('major-event-price', 'price-1', { majorEventId: 'major-1', type: 'TIERED' });
    const validTier = transferResource('price-tier', 'tier-1', { priceId: price.id, name: 'Regular', value: 100 });
    const context = createContext(tx, [price, validTier]);
    await expect(
      adapter.validatePlan(await adapter.resolve(price, context), context, [price, validTier]),
    ).resolves.toBeUndefined();
  });
  it('creates a form with the stable ID supplied by the normalized transfer document', async () => {
    const eventForm = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'form-static-id' }),
    };
    const event = {
      findFirst: jest.fn().mockResolvedValue({
        id: 'event-1',
        eventGroupId: null,
        majorEventId: null,
        eventGroup: null,
      }),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const adapter = createAdapter({ eventForm, event, audit });
    const resource = transferResource('event-form', 'form-static-id', {
      ownerEventId: 'event-1',
      ownerMajorEventId: null,
      name: 'Registration',
      elements: [],
    });
    const context = createContext({ eventForm, event, audit }, [resource]);
    const snapshot = await adapter.resolve(resource, context);

    await adapter.apply(snapshot, 'create', context);

    expect(eventForm.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id: 'form-static-id', name: 'Registration', ownerEventId: 'event-1' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('blocks a tier rename when the same document explicitly imports affected subscription snapshots', async () => {
    const priceTier = {
      findFirst: jest.fn().mockResolvedValue({
        id: 'tier-1',
        priceId: 'price-1',
        name: 'Silver',
        value: 100,
        includesEventRegistration: true,
        includesSportsRegistration: false,
        restrictEventSelection: false,
        allowedEventIds: [],
        customizeSubscriptionLimits: false,
        maxCoursesPerAttendee: null,
        maxLecturesPerAttendee: null,
        maxUncategorizedPerAttendee: null,
        price: { majorEventId: 'major-1', majorEvent: { deletedAt: null } },
      }),
    };
    const tier = transferResource('price-tier', 'tier-1', { priceId: 'price-1', name: 'Gold' });
    const subscription = transferResource('major-event-subscription', 'subscription-source', {
      majorEventId: 'major-1',
      person: { id: 'person-1' },
      paymentTier: 'Silver',
    });
    const majorEventSubscription = { findFirst: jest.fn().mockResolvedValue({ paymentTier: 'Silver' }) };
    const context = createContext({ priceTier, majorEventSubscription }, [tier, subscription]);
    const snapshot = await createAdapter({}).resolve(tier, context);

    expect(snapshot.skip?.message).toContain('paymentTier');
    expect(snapshot.additionalChanges).toBeUndefined();
  });

  it('renames only matching snapshots in the owning major event and requires rights for affected rows', async () => {
    const tierRow = {
      id: 'tier-1',
      priceId: 'price-1',
      name: 'Silver',
      value: 100,
      includesEventRegistration: true,
      includesSportsRegistration: false,
      restrictEventSelection: false,
      allowedEventIds: [],
      customizeSubscriptionLimits: false,
      maxCoursesPerAttendee: null,
      maxLecturesPerAttendee: null,
      maxUncategorizedPerAttendee: null,
      price: { majorEventId: 'major-1', majorEvent: { deletedAt: null } },
    };
    const subscriptions = [
      { id: 'subscription-old', paymentTier: ' silver ' },
      { id: 'subscription-current', paymentTier: 'Gold' },
    ];
    const certificateConfigs = [
      { id: 'certificate-old', paymentTiers: ['Silver', 'Gold', 'silver'] },
      { id: 'certificate-current', paymentTiers: ['Gold'] },
    ];
    const tierFindMany = jest.fn(async ({ select }: { select: Record<string, boolean> }) =>
      select['id'] ? subscriptions : subscriptions.map(({ paymentTier }) => ({ paymentTier })),
    );
    const certificateFindMany = jest.fn(async ({ select }: { select: Record<string, boolean> }) =>
      select['id'] ? certificateConfigs : certificateConfigs.map(({ paymentTiers }) => ({ paymentTiers })),
    );
    const assertPermissions = jest.fn().mockResolvedValue(undefined);
    const tx = {
      priceTier: { findFirst: jest.fn().mockResolvedValue(tierRow), update: jest.fn().mockResolvedValue(undefined) },
      majorEventPrice: { findFirst: jest.fn().mockResolvedValue({ id: 'price-1', majorEventId: 'major-1' }) },
      majorEventSubscription: {
        findMany: tierFindMany,
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      certificateConfig: {
        findMany: certificateFindMany,
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const resource = transferResource('price-tier', 'tier-1', { priceId: 'price-1', name: 'Gold' });
    const context = createContext(tx, [resource]);
    const adapter = createAdapter({ authorization: { assertPermissions } });
    const snapshot = await adapter.resolve(resource, context);

    expect(snapshot.scope).toEqual({ majorEventId: 'major-1' });
    expect(snapshot.additionalChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: expect.stringContaining('Inscrições'), before: 1 }),
        expect.objectContaining({ field: expect.stringContaining('Certificados'), before: 1 }),
      ]),
    );
    await adapter.assertRead(snapshot, context);
    await adapter.assertWrite(snapshot, 'update', context);
    await adapter.validate(snapshot, context);
    await adapter.apply(snapshot, 'update', context);

    expect(tierFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { majorEventId: 'major-1', paymentTier: { not: null } } }),
    );
    expect(tx.majorEventSubscription.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['subscription-old'] } },
      data: { paymentTier: 'Gold' },
    });
    expect(certificateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { majorEventId: 'major-1' },
            { event: { majorEventId: 'major-1' } },
            { eventGroup: { majorEventId: 'major-1' } },
          ],
        },
      }),
    );
    expect(tx.certificateConfig.update).toHaveBeenCalledTimes(1);
    expect(tx.certificateConfig.update).toHaveBeenCalledWith({
      where: { id: 'certificate-old' },
      data: { paymentTiers: ['Gold'] },
    });
    expect(assertPermissions).toHaveBeenCalledWith(context.actor, [Permission.Subscription.Update], {
      majorEventId: 'major-1',
    });
    expect(assertPermissions).toHaveBeenCalledWith(context.actor, [Permission.CertificateConfig.Update], {
      majorEventId: 'major-1',
    });
  });

  it('requires a name when a new form is created', async () => {
    const adapter = createAdapter({});
    const resource = transferResource('event-form', 'form-1', {
      ownerEventId: 'event-1',
      elements: [],
    });
    const context = createContext({}, [resource]);
    const snapshot = {
      resource,
      current: null,
      revision: null,
      scope: { eventId: 'event-1' },
      dependencies: [],
    };

    await expect(adapter.validate(snapshot, context)).rejects.toThrow('O formulário precisa ter um nome.');
  });

  it('resolves the scope of a child config attached to an event created in the same document', async () => {
    const event = { findFirst: jest.fn().mockResolvedValue(null) };
    const eventGroup = { findFirst: jest.fn().mockResolvedValue(null) };
    const ticketConfig = {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
    };
    const eventResource = transferResource('event', 'event-new', { name: 'New event', majorEventId: 'major-new' });
    const majorEventResource = transferResource('major-event', 'major-new', { name: 'New major event' });
    const config = transferResource('ticket-config', 'ticket-config-new', {
      eventId: 'event-new',
      recipientSubscriptionRequirement: 'ANY',
      expirationMode: 'EVENT_END',
    });
    const context = createContext({ event, eventGroup, ticketConfig }, [eventResource, majorEventResource, config]);
    const adapter = createAdapter({ event, eventGroup, ticketConfig });
    const snapshot = await adapter.resolve(config, context);

    expect(snapshot.scope).toEqual({ eventId: 'event-new', majorEventId: 'major-new' });
    await expect(adapter.validate(snapshot, context)).resolves.toBeUndefined();
  });

  it('authorizes a config under an all-new tree globally without targeting nonexistent parents', async () => {
    const tx = {
      event: { findFirst: jest.fn().mockResolvedValue(null) },
      eventGroup: { findFirst: jest.fn().mockResolvedValue(null) },
      majorEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const grants = new Set<Permission>([
      Permission.DataTransfer.Import,
      Permission.EventForm.Read,
      Permission.EventForm.Create,
    ]);
    const assertPermissions = jest.fn(
      async (_actor: AuthenticatedUser, permissions: readonly Permission[], scope: Record<string, string> = {}) => {
        if (['eventId', 'eventGroupId', 'majorEventId'].some((field) => field in scope)) {
          throw new NotFoundException('A scoped authorization target does not exist.');
        }
        for (const permission of permissions) {
          if (!grants.has(permission)) throw new Error(`Missing global grant for ${permission}`);
        }
      },
    );
    const adapter = createAdapter({ tx, authorization: { assertPermissions } });
    const resource = transferResource('event-form', 'form-new', {
      ownerEventId: 'event-new',
      ownerMajorEventId: 'major-new',
      name: 'Registration',
      elements: [],
    });
    const context = createContext(tx, [resource]);
    const snapshot: ResolvedTransferResource = {
      resource,
      current: null,
      revision: null,
      scope: { eventId: 'event-new', majorEventId: 'major-new' },
      dependencies: [],
    };

    await adapter.assertRead(snapshot, context);
    await adapter.assertWrite(snapshot, 'create', context);

    expect(assertPermissions).toHaveBeenNthCalledWith(
      1,
      context.actor,
      [Permission.DataTransfer.Import, Permission.EventForm.Read],
      {},
    );
    expect(assertPermissions).toHaveBeenNthCalledWith(
      2,
      context.actor,
      [Permission.DataTransfer.Import, Permission.EventForm.Create],
      {},
    );
  });

  it('authorizes a new tier under a same-file price table at its existing major event', async () => {
    const price = transferResource('major-event-price', 'price-new', { majorEventId: 'major-1', type: 'TIERED' });
    const tier = transferResource('price-tier', 'tier-new', { priceId: 'price-new', name: 'Standard', value: 100 });
    const authorization = {
      assertPermissions: jest.fn(async (_actor, _permissions, scope) => {
        if (scope.majorEventId !== 'major-1') throw new ForbiddenException();
      }),
    };
    const tx = {
      priceTier: { findFirst: jest.fn().mockResolvedValue(null) },
      majorEventPrice: { findFirst: jest.fn().mockResolvedValue(null) },
      majorEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'major-1' }) },
    };
    const adapter = createAdapter({ authorization });
    const context = createContext(tx, [price, tier]);
    const snapshot = await adapter.resolve(tier, context);

    expect(snapshot.scope).toEqual({ majorEventId: 'major-1' });
    await expect(adapter.assertRead(snapshot, context)).resolves.toBeUndefined();
    await expect(adapter.assertWrite(snapshot, 'create', context)).resolves.toBeUndefined();
    await expect(adapter.validate(snapshot, context)).resolves.toBeUndefined();
    expect(authorization.assertPermissions).toHaveBeenCalledWith(
      context.actor,
      [Permission.DataTransfer.Import, Permission.MajorEvent.Update],
      { majorEventId: 'major-1' },
    );
  });

  it('checks a tier under an entirely new price hierarchy against global permissions', async () => {
    const major = transferResource('major-event', 'major-new', { name: 'New series' });
    const price = transferResource('major-event-price', 'price-new', { majorEventId: major.id, type: 'TIERED' });
    const tier = transferResource('price-tier', 'tier-new', { priceId: price.id, name: 'Standard', value: 100 });
    const authorization = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
    const tx = {
      priceTier: { findFirst: jest.fn().mockResolvedValue(null) },
      majorEventPrice: { findFirst: jest.fn().mockResolvedValue(null) },
      majorEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const adapter = createAdapter({ authorization });
    const context = createContext(tx, [major, price, tier]);
    const snapshot = await adapter.resolve(tier, context);

    expect(snapshot.scope).toEqual({ majorEventId: major.id });
    await adapter.assertRead(snapshot, context);
    await adapter.assertWrite(snapshot, 'create', context);
    expect(authorization.assertPermissions).toHaveBeenCalledWith(
      context.actor,
      [Permission.DataTransfer.Import, Permission.MajorEvent.Update],
      {},
    );
  });

  it('validates and applies a partial form-link update while preserving omitted parents', async () => {
    const current = transferResource('form-link', 'link-1', {
      formId: 'form-1',
      targetType: 'EVENT',
      eventId: 'event-1',
      majorEventId: null,
      audiences: ['SUBSCRIBERS'],
      displayOrder: 0,
    });
    const resource = transferResource('form-link', current.id, { displayOrder: 1 });
    const storedLink = { id: current.id, ...current.data, updatedAt: new Date(), priceTiers: [] };
    const tx = {
      eventForm: { findFirst: jest.fn().mockResolvedValue({ id: 'form-1' }) },
      event: { findFirst: jest.fn().mockResolvedValue({ id: 'event-1' }) },
      eventFormLink: {
        findFirst: jest.fn().mockImplementation(async ({ where }) => (where.id === current.id ? storedLink : null)),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const adapter = createAdapter(tx);
    const context = createContext(tx, [resource]);
    const snapshot = await adapter.resolve(resource, context);

    await expect(adapter.validate(snapshot, context)).resolves.toBeUndefined();
    await adapter.apply(snapshot, 'update', context);
    const writtenData = tx.eventFormLink.updateMany.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(writtenData['displayOrder']).toBe(1);
    expect(writtenData).not.toHaveProperty('formId');
    expect(writtenData).not.toHaveProperty('targetType');
    expect(writtenData).not.toHaveProperty('eventId');
  });

  it.each([{ formId: 'other-form' }, { targetType: 'MAJOR_EVENT' }])(
    'rejects an explicit form-link ownership change: %o',
    async (data) => {
      const current = transferResource('form-link', 'link-1', {
        formId: 'form-1',
        targetType: 'EVENT',
        eventId: 'event-1',
      });
      const resource = transferResource('form-link', current.id, data);
      const snapshot: ResolvedTransferResource = {
        resource,
        current,
        revision: null,
        scope: { eventId: 'event-1' },
        dependencies: [],
      };
      await expect(createAdapter({}).validate(snapshot, createContext({}, [resource]))).rejects.toThrow(
        'A configuração existente não pode ser movida',
      );
    },
  );

  it('roundtrips a form while warning that uploaded images are omitted', async () => {
    const form = {
      id: 'form-1',
      updatedAt: new Date(),
      deletedAt: null,
      name: 'Feedback',
      description: null,
      elements: [
        {
          id: 'question-1',
          type: 'shortText',
          title: 'Name',
          descriptionImages: [{ id: 'image-1', altText: 'Logo' }],
          required: false,
          options: [],
        },
      ],
      ownerEventId: 'event-1',
      ownerMajorEventId: null,
      sigilo: 'SECRET',
      responseMode: 'ONE_PER_TARGET',
      resultsPublic: false,
      resultsLive: false,
      allowResponseEdits: false,
      descriptionImages: [{ id: 'image-1', altText: 'Logo' }],
    };
    const prismaParts = {
      event: {
        findMany: jest.fn().mockResolvedValue([{ id: 'event-1' }]),
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'event-1', eventGroupId: null, majorEventId: null, eventGroup: null }),
      },
      eventForm: {
        findMany: jest.fn().mockResolvedValue([form]),
        findFirst: jest.fn().mockResolvedValue(form),
      },
      eventFormLink: { findMany: jest.fn().mockResolvedValue([]) },
      certificateConfig: { findMany: jest.fn().mockResolvedValue([]) },
      ticketConfig: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const adapter = createAdapter(prismaParts);
    const context = createContext(prismaParts, []);
    const exported = await adapter.exportTarget(
      { kind: 'event', id: 'event-1' },
      {
        includeDescendants: true,
        includeConfiguration: true,
        includeSubscriptions: false,
        includeAttendances: false,
      },
      context,
    );
    const exportedForm = exported.resources.find((resource) => resource.kind === 'event-form');
    if (!exportedForm) throw new Error('Expected the owned form to be exported.');
    const resolved = await adapter.resolve(exportedForm, context);

    expect(diffResourceData(resolved.current, exportedForm)).toEqual([]);
    expect(exported.issues).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'event-form' })]));
  });

  it('does not disclose denied form IDs or image warnings in export issues', async () => {
    const form = {
      id: 'private-form-id',
      updatedAt: new Date(),
      deletedAt: null,
      name: 'Private form',
      description: null,
      elements: [{ id: 'q1', type: 'shortText', title: 'Question', descriptionImages: [{ id: 'hidden-image' }] }],
      ownerEventId: 'event-1',
      ownerMajorEventId: null,
      sigilo: 'SECRET',
      responseMode: 'ONE_PER_TARGET',
      resultsPublic: false,
      resultsLive: false,
      allowResponseEdits: false,
      descriptionImages: [{ id: 'hidden-image' }],
    };
    const prismaParts = {
      authorization: { assertPermissions: jest.fn().mockRejectedValue(new ForbiddenException()) },
      event: {
        findMany: jest.fn().mockResolvedValue([{ id: 'event-1' }]),
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'event-1', eventGroupId: null, majorEventId: null, eventGroup: null }),
      },
      eventForm: { findMany: jest.fn().mockResolvedValue([form]) },
      eventFormLink: { findMany: jest.fn().mockResolvedValue([]) },
      certificateConfig: { findMany: jest.fn().mockResolvedValue([]) },
      ticketConfig: { findMany: jest.fn().mockResolvedValue([]) },
      majorEventPrice: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const adapter = createAdapter(prismaParts);
    const context = createContext(prismaParts, []);

    const exported = await adapter.exportTarget(
      { kind: 'event', id: 'event-1' },
      {
        includeDescendants: true,
        includeConfiguration: true,
        includeSubscriptions: false,
        includeAttendances: false,
      },
      context,
    );

    expect(exported.resources).toEqual([]);
    expect(exported.issues).toEqual([
      { kind: 'event-form', message: 'Uma configuração relacionada foi omitida por falta de acesso.' },
    ]);
    expect(JSON.stringify(exported.issues)).not.toContain('private-form-id');
    expect(JSON.stringify(exported.issues)).not.toContain('hidden-image');
    expect(JSON.stringify(exported.issues)).not.toContain('Referências a imagens enviadas');
  });
});

function createAdapter(prismaParts: Record<string, unknown>) {
  return new ConfigurationTransferAdapter(
    prismaParts as never,
    (prismaParts['authorization'] ?? { assertPermissions: jest.fn().mockResolvedValue(undefined) }) as never,
    (prismaParts['frozen'] ?? {}) as never,
    (prismaParts['audit'] ?? { record: jest.fn().mockResolvedValue(undefined) }) as never,
    { match: jest.fn().mockResolvedValue({ id: 'person-1' }) } as never,
    {} as never,
    {} as never,
    { refresh: jest.fn().mockResolvedValue(undefined) } as never,
    { upsertMajorEvent: jest.fn().mockResolvedValue(undefined) } as never,
    { publish: jest.fn().mockResolvedValue(undefined), scope: (value: string) => value } as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

function createTicketTransferAdapter(prismaParts: Record<string, unknown>, dependencies: Record<string, unknown> = {}) {
  return new ConfigurationTransferAdapter(
    prismaParts as never,
    (dependencies['authorization'] ?? { assertPermissions: jest.fn().mockResolvedValue(undefined) }) as never,
    (dependencies['frozen'] ?? {}) as never,
    (dependencies['audit'] ?? { record: jest.fn().mockResolvedValue(undefined) }) as never,
    { match: jest.fn().mockResolvedValue({ id: 'person-1' }) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    (dependencies['issuance'] ?? {}) as never,
    (dependencies['ticketRealtime'] ?? {}) as never,
    (dependencies['attendanceCategories'] ?? {}) as never,
  );
}

function previewService(tx: Record<string, unknown>, adapters: ConstructorParameters<typeof DataTransferService>[3]) {
  return new DataTransferService(
    { ...tx, $transaction: jest.fn(async (operation: (value: unknown) => Promise<unknown>) => operation(tx)) } as never,
    { assertPermissions: jest.fn().mockResolvedValue(undefined) } as never,
    {} as never,
    adapters,
    new TransferKeyAllocations(),
  );
}

function createContext(prismaParts: Record<string, unknown>, resources: TransferResource[]): TransferAdapterContext {
  return {
    tx: prismaParts as never,
    actor: { sub: 'organizer-1' } as AuthenticatedUser,
    document: { format: 'cacic-event-data', version: 1, resources } as TransferAdapterContext['document'],
    frozenResources: {} as never,
  };
}

function transferResource(kind: TransferResourceKind, id: string, data: Record<string, unknown>): TransferResource {
  return { kind, id, data } as TransferResource;
}
