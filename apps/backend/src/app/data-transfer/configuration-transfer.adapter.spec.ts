import type { TransferResource, TransferResourceKind } from '@cacic-fct/shared-data-transfer';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { diffResourceData } from './data-transfer.service';
import type { ResolvedTransferResource, TransferAdapterContext } from './data-transfer-adapter';
import { ConfigurationTransferAdapter } from './configuration-transfer.adapter';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { DataTransferService } from './data-transfer.service';
import { TransferKeyAllocations } from './transfer-key-allocations';

describe('ConfigurationTransferAdapter', () => {
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
