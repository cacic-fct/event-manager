import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type {
  TransferResource,
  TransferResourceKind,
  TransferItem,
  TransferTarget,
  ResolvedTransferDocument,
} from '@cacic-fct/shared-data-transfer';
import { sortRowsForApply, type TransferDependencyRow } from './data-transfer.service';
import { DataTransferService } from './data-transfer.service';
import type { DataTransferAdapter, ResolvedTransferResource } from './data-transfer-adapter';
import { TransferKeyAllocations } from './transfer-key-allocations';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ParticipationTransferAdapter } from './participation-transfer-adapter';

describe('sortRowsForApply', () => {
  it('orders same-file parents before children even when the child appears first', () => {
    const child = row('event', 'event-1', { eventGroupId: 'group-1' }, 0);
    const parent = row('group', 'group-1', {}, 1);

    expect(sortRowsForApply([child, parent]).map(({ item }) => item.id)).toEqual(['group-1', 'event-1']);
  });

  it('uses adapter phase and source order as stable tie breakers for unrelated writes', () => {
    const laterAdapter = row('event', 'event-1', {}, 0, 20);
    const earlierAdapter = row('group', 'group-1', {}, 1, 10);
    const sameAdapterLater = row('major-event', 'major-1', {}, 2, 10);

    expect(sortRowsForApply([laterAdapter, sameAdapterLater, earlierAdapter]).map(({ item }) => item.id)).toEqual([
      'group-1',
      'major-1',
      'event-1',
    ]);
  });

  it('orders a backing-resource alias after its aggregate owner', () => {
    const child = row('event', 'event-1', { eventGroupId: 'group-1' }, 0, 10);
    const alias = row('group', 'group-1', {}, 1, 10);
    const owner = row('sports-category', 'category-1', {}, 2, 30);
    const aliasSnapshot = alias.snapshot;
    if (!aliasSnapshot) throw new Error('Test alias needs a dependency snapshot.');
    alias.action = 'skip';
    aliasSnapshot.ownedBy = { kind: 'sports-category', id: 'category-1' };
    alias.snapshot = aliasSnapshot;

    expect(sortRowsForApply([child, alias, owner]).map(({ item }) => item.id)).toEqual([
      'category-1',
      'event-1',
      'group-1',
    ]);
  });

  it('rejects dependency cycles before returning any write order', () => {
    const first = row('sports-venue', 'venue-1', { parentVenueId: 'venue-2' }, 0);
    const second = row('sports-venue', 'venue-2', { parentVenueId: 'venue-1' }, 1);

    expect(() => sortRowsForApply([first, second])).toThrow('dependências circulares');
  });

  it('does not turn scalar ID policy arrays into write-order cycles', () => {
    const event = row('event', 'event-1', { regularAttendancePriceTierIds: ['tier-1'] }, 0);
    const tier = row('price-tier', 'tier-1', { allowedEventIds: ['event-1'] }, 1);

    expect(sortRowsForApply([event, tier]).map(({ item }) => item.id)).toEqual(['event-1', 'tier-1']);
  });
});

const relativeAliasStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const relativeAliasEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString();

describe('data transfer planning dependencies', () => {
  it('does not retain key allocations for a fully unauthorized preview', async () => {
    const calls = {
      read: jest.fn().mockRejectedValue(new ForbiddenException()),
      write: jest.fn(),
      mutable: jest.fn(),
      validate: jest.fn(),
      apply: jest.fn(),
    };
    const adapter = createPlanningAdapter(['group'], calls, async (resource) => ({
      resource,
      current: null,
      revision: null,
      scope: {},
      dependencies: [],
    }));
    const resolver = new TransferKeyAllocations();
    const allocationPreview = jest.spyOn(resolver, 'preview');
    try {
      const service = new DataTransferService(
        { $transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation({}) } as never,
        { assertPermissions: jest.fn().mockResolvedValue(undefined) } as never,
        {} as never,
        [adapter],
        resolver,
      );
      const document = {
        format: 'cacic-event-data' as const,
        version: 1 as const,
        resources: [{ kind: 'group' as const, key: 'GROUP-1', data: { name: 'Grupo' } }],
      };
      const preview = await service.preview({ document }, organizer());
      expect(preview.canApply).toBe(false);
      expect(preview.allocation).toBeUndefined();
      const prepared = allocationPreview.mock.results[0].value;
      expect(() => resolver.apply(document, 'organizer-1', prepared.allocation.token)).toThrow(ConflictException);
    } finally {
      allocationPreview.mockRestore();
    }
  });

  it.each([
    [500, false],
    [501, true],
  ])('bounds aggregate exports with %s distinct resources', async (count, oversized) => {
    const resource = (id: number): TransferResource => ({ kind: 'event', id: `event-${id}`, data: { name: 'Evento' } });
    const adapter = (
      kinds: TransferResourceKind[],
      resources: TransferResource[],
      dependencyOrder: number,
    ): DataTransferAdapter => ({
      kinds,
      dependencyOrder,
      resolve: jest.fn(),
      assertRead: jest.fn(),
      assertWrite: jest.fn(),
      assertMutable: jest.fn(),
      validate: jest.fn(),
      apply: jest.fn(),
      exportTarget: jest.fn().mockResolvedValue({ resources, issues: [] }),
    });
    const first = adapter(
      ['event'],
      Array.from({ length: 300 }, (_, index) => resource(index)),
      10,
    );
    const second = adapter(
      ['group'],
      Array.from({ length: count - 300 }, (_, index) => resource(index + 300)),
      20,
    );
    // The shared row is emitted twice; the bound must count distinct resources.
    jest.mocked(second.exportTarget).mockResolvedValue({
      resources: [resource(0), ...Array.from({ length: count - 300 }, (_, index) => resource(index + 300))],
      issues: [],
    });
    const last = adapter(['major-event'], [], 30);
    const service = createServiceForPlan([first, second, last], {
      event: { findFirst: jest.fn().mockResolvedValue({ id: 'event-0' }) },
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation({})),
    });
    const result = service.export(
      {
        target: { kind: 'event', id: 'event-0' },
        includeDescendants: true,
        includeConfiguration: true,
      },
      organizer(),
    );
    if (oversized) {
      await expect(result).rejects.toThrow(BadRequestException);
      expect(last.exportTarget).not.toHaveBeenCalled();
    } else {
      expect((await result).document.resources).toHaveLength(count);
    }
  });

  it('propagates a blocked root through children regardless of row order', () => {
    const service = createServiceForPlan();
    const child = stateRow('event', 'event-1', { eventGroupId: 'group-1' }, 0);
    const parent = stateRow('group', 'group-1', { majorEventId: 'major-1' }, 1);
    const root = stateRow('major-event', 'major-1', {}, 2, 'blocked');

    callDependencyPropagation(service, [child, parent, root]);

    for (const row of [child, parent]) {
      expect(row.status).toBe('blocked');
      expect(row.action).toBe('skip');
      expect(row.item.changes).toEqual([]);
    }
  });

  it('clears changes and skips an owned alias when its aggregate owner is blocked', () => {
    const service = createServiceForPlan();
    const alias = stateRow('event', 'event-1', { eventGroupId: 'group-1', name: 'New' }, 0);
    const aliasSnapshot = alias.snapshot;
    if (!aliasSnapshot) throw new Error('Test alias needs an ownership snapshot.');
    aliasSnapshot.ownedBy = { kind: 'group', id: 'group-1' };
    const owner = stateRow('group', 'group-1', { name: 'New' }, 1, 'blocked');

    callDependencyPropagation(service, [alias, owner]);

    expect(alias).toMatchObject({
      action: 'skip',
      status: 'blocked',
      item: { action: 'skip', status: 'blocked', changes: [] },
    });
  });

  it('validates even an empty create and passes bounded serializable transaction options', async () => {
    const calls = { read: jest.fn(), write: jest.fn(), mutable: jest.fn(), validate: jest.fn(), apply: jest.fn() };
    const adapter = createPlanningAdapter(['group'], calls, async (resource) => ({
      resource,
      current: null,
      revision: null,
      scope: {},
      dependencies: [],
    }));
    const transactionOptions: unknown[] = [];
    const prisma = {
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>, options: unknown) => {
        transactionOptions.push(options);
        return operation({});
      }),
    };
    const service = createServiceForPlan([adapter], prisma);
    const preview = await service.preview(
      {
        document: {
          $schema: 'urn:cacic:event-data:v1',
          format: 'cacic-event-data',
          version: 1,
          resources: [{ kind: 'group', id: 'group-empty', data: {} }],
        },
      },
      organizer(),
    );

    expect(preview.items[0]).toMatchObject({ action: 'create', status: 'ready' });
    expect(calls.read).toHaveBeenCalledTimes(1);
    expect(calls.write).toHaveBeenCalledTimes(1);
    expect(calls.mutable).toHaveBeenCalledTimes(1);
    expect(calls.validate).toHaveBeenCalledTimes(1);
    expect(transactionOptions).toEqual([expect.objectContaining({ maxWait: 10_000, timeout: 120_000 })]);
  });

  it('uses bounded serializable transaction options for export', async () => {
    const transactionOptions: unknown[] = [];
    const tx = {};
    const event = {
      findFirst: jest.fn().mockResolvedValue({ id: 'event-1' }),
    };
    const prisma = {
      event,
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>, options: unknown) => {
        transactionOptions.push(options);
        return operation(tx);
      }),
    };
    const exportResource = {
      kind: 'event',
      id: 'event-1',
      data: {
        name: 'Event',
        startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
      },
    } as TransferResource;
    const adapter: DataTransferAdapter = {
      kinds: ['event'],
      dependencyOrder: 10,
      resolve: jest.fn(),
      assertRead: jest.fn(),
      assertWrite: jest.fn(),
      assertMutable: jest.fn(),
      validate: jest.fn(),
      apply: jest.fn(),
      exportTarget: jest.fn().mockResolvedValue({ resources: [exportResource], issues: [] }),
    };
    const service = createServiceForPlan([adapter], prisma);

    await service.export(
      {
        target: { kind: 'event', id: 'event-1' },
        includeDescendants: true,
        includeConfiguration: true,
      },
      organizer(),
    );

    expect(transactionOptions).toEqual([expect.objectContaining({ maxWait: 10_000, timeout: 120_000 })]);
  });

  it.each([
    ['create', null, 'create', 'ready'],
    [
      'update',
      { name: 'Old event', eventGroupId: 'group-1', startDate: relativeAliasStart, endDate: relativeAliasEnd },
      'update',
      'ready',
    ],
    [
      'unchanged',
      { name: 'New event', eventGroupId: 'group-1', startDate: relativeAliasStart, endDate: relativeAliasEnd },
      'unchanged',
      'unchanged',
    ],
  ] as const)(
    'applies an owned %s alias through its owner without partial consent',
    async (_caseName, aliasData, expectedAction, expectedStatus) => {
      const ownerApply = jest.fn().mockResolvedValue({});
      const aliasApply = jest.fn().mockResolvedValue({});
      const ownerAdapter: DataTransferAdapter = {
        kinds: ['group'],
        dependencyOrder: 10,
        claims: async (resource) => resource.kind === 'event',
        resolve: async (resource) => {
          if (resource.kind === 'group') {
            return {
              resource,
              current: { kind: 'group', id: resource.id, data: { name: 'Old group' } } as TransferResource,
              revision: 'group-v1',
              scope: {},
              dependencies: [],
            };
          }
          const current = aliasData ? ({ kind: 'event', id: resource.id, data: aliasData } as TransferResource) : null;
          return {
            resource,
            current,
            revision: current ? 'event-v1' : null,
            scope: {},
            dependencies: [{ kind: 'group', id: 'group-1' }],
            ownedBy: { kind: 'group', id: 'group-1' },
            skip: { message: 'Managed by group writer.' },
          };
        },
        assertRead: jest.fn().mockResolvedValue(undefined),
        assertWrite: jest.fn().mockResolvedValue(undefined),
        assertMutable: jest.fn().mockResolvedValue(undefined),
        validate: jest.fn().mockResolvedValue(undefined),
        apply: jest.fn(async (snapshot) => {
          if (snapshot.resource.kind === 'group') return ownerApply(snapshot);
          return aliasApply(snapshot);
        }),
        exportTarget: jest.fn().mockResolvedValue({ resources: [], issues: [] }),
      };
      const tx = {};
      const transactionOptions: unknown[] = [];
      const prisma = {
        $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>, options: unknown) => {
          transactionOptions.push(options);
          return operation(tx);
        }),
      };
      const recorder = { tx, setSource: jest.fn() };
      const journal = {
        begin: jest.fn(() => recorder),
        record: jest.fn().mockResolvedValue({ batchId: 'batch-1', auditEntryId: 'audit-1' }),
        findCommittedRequest: jest.fn().mockResolvedValue(null),
      };
      const service = createServiceForPlan([ownerAdapter], prisma, journal);
      const document = aliasDocument(aliasData);
      const preview = await service.preview({ document }, organizer());
      const eventPreview = preview.items.find((item) => item.kind === 'event');
      expect(eventPreview).toMatchObject({ action: expectedAction, status: expectedStatus });
      expect(preview.summary.skip).toBe(0);

      const result = await service.apply(
        {
          document,
          planHash: preview.planHash,
          allowPartial: false,
        },
        organizer(),
      );

      expect(result.applied).toBe(true);
      expect(transactionOptions).toHaveLength(2);
      expect(transactionOptions).toEqual([
        expect.objectContaining({ maxWait: 10_000, timeout: 120_000 }),
        expect.objectContaining({ maxWait: 10_000, timeout: 120_000 }),
      ]);
      expect(ownerApply).toHaveBeenCalledTimes(1);
      expect(aliasApply).not.toHaveBeenCalled();
      const eventResult = result.items.find((item) => item.kind === 'event');
      expect(eventResult?.status).toBe('applied');
    },
  );
});

describe('key-only participation result normalization', () => {
  it('returns the matched stored subscription ID and strips raw person identity on apply', async () => {
    const actor = organizer();
    const existing = {
      id: 'stored-subscription',
      eventId: 'event-1',
      personId: 'person-1',
      imageLicenseAgreementAccepted: true,
      createdAt: new Date(),
      deletedAt: null,
    };
    const tx = {
      event: {
        findFirst: jest
          .fn()
          .mockImplementation(async (args: { select?: Record<string, unknown> }) =>
            args.select?.['sportsMatch']
              ? { majorEventId: null, eventGroup: null, sportsMatch: null }
              : { id: 'event-1' },
          ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      eventSubscription: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest
          .fn()
          .mockImplementation(async (args: { where?: Record<string, unknown> }) =>
            args.where?.['eventId'] === 'event-1' ? existing : null,
          ),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(existing),
      },
      eventLecturer: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const permissions = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
    const people = { match: jest.fn().mockResolvedValue({ id: 'person-1' }) };
    const participation = new ParticipationTransferAdapter(
      permissions as never,
      people as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      {
        refreshForAttendance: jest.fn().mockResolvedValue(undefined),
        refreshForMajorEventPerson: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        ensureEventIdsHaveAvailableSlots: jest.fn().mockResolvedValue(undefined),
        syncMajorEventConfirmedSubscriptions: jest.fn(),
      } as never,
      { refresh: jest.fn().mockResolvedValue(undefined) } as never,
      {
        forEvent: jest.fn().mockResolvedValue(undefined),
        forMajorEvent: jest.fn().mockResolvedValue(undefined),
      } as never,
      {} as never,
    );
    const prisma = { $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation(tx)) };
    const recorder = { tx, setSource: jest.fn() };
    const journal = {
      begin: jest.fn(() => recorder),
      record: jest.fn().mockResolvedValue({ batchId: 'batch-1', auditEntryId: 'audit-1' }),
      findCommittedRequest: jest.fn().mockResolvedValue(null),
    };
    const service = createServiceForPlan([participation], prisma, journal, permissions);
    const document = {
      $schema: 'urn:cacic:event-data:v1',
      format: 'cacic-event-data',
      version: 1,
      resources: [
        {
          kind: 'event-subscription',
          key: 'SUB-1',
          data: {
            eventId: 'event-1',
            person: { email: 'ada@example.com' },
            imageLicenseAgreementAccepted: false,
          },
        },
      ],
    };

    const preview = await service.preview({ document }, actor);
    expect(preview.items[0]?.id).toBe('stored-subscription');
    expect(preview.allocation?.ids['SUB-1']).toBe('stored-subscription');
    expect(preview.allocation?.token).toEqual(expect.any(String));
    const result = await service.apply(
      {
        document,
        planHash: preview.planHash,
        allowPartial: false,
        allocationToken: preview.allocation?.token,
      },
      actor,
    );
    const resource = result.document?.resources[0];
    const normalizedPerson = resource?.kind === 'event-subscription' ? resource.data.person : undefined;

    expect(resource).toMatchObject({
      kind: 'event-subscription',
      id: 'stored-subscription',
      data: { person: { id: 'person-1' } },
    });
    expect(resource).not.toHaveProperty('key');
    expect(normalizedPerson).not.toHaveProperty('email');
    expect(people.match).toHaveBeenCalledWith({ email: 'ada@example.com' }, tx);
  });
});

describe('exact committed apply request replay', () => {
  function createReplayFixture() {
    let appliedResource: TransferResource | null = null;
    const adapterCalls = {
      read: jest.fn().mockResolvedValue(undefined),
      write: jest.fn().mockResolvedValue(undefined),
      mutable: jest.fn().mockResolvedValue(undefined),
      validate: jest.fn().mockResolvedValue(undefined),
      apply: jest.fn(async (snapshot: ResolvedTransferResource) => {
        appliedResource = {
          kind: 'group',
          id: 'stored-group-1',
          data: { name: snapshot.resource.kind === 'group' ? snapshot.resource.data.name?.trim() : undefined },
        };
        return {};
      }),
    };
    const adapter = createPlanningAdapter(['group'], adapterCalls, async (resource) => ({
      resource,
      current: { kind: 'group', id: resource.id, data: { name: 'Old group' } } as TransferResource,
      resolvedId: 'stored-group-1',
      revision: 'revision-1',
      scope: { eventGroupId: 'stored-group-1' },
      dependencies: [],
    }));
    adapter.readAppliedResource = jest.fn(async () => {
      if (!appliedResource) throw new Error('The resource was not persisted.');
      return appliedResource;
    });
    const transaction = {};
    const prisma = {
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation(transaction)),
    };
    const recorder = { tx: transaction, setSource: jest.fn() };
    let committed: {
      entry: { id: string; actorId: string; revertedAt: null };
      metadata: {
        requestFingerprint: string;
        requestPlanHash: string;
        requestItems: Array<Pick<TransferItem, 'kind' | 'id' | 'action' | 'status' | 'message'>>;
        requestSummary: { create: number; update: number; unchanged: number; skip: number };
        document: ResolvedTransferDocument;
        synchronizationPending: boolean;
        undone: boolean;
      };
    } | null = null;
    const journal = {
      lockRequest: jest.fn().mockResolvedValue(undefined),
      findCommittedRequest: jest.fn(async (actor: AuthenticatedUser | undefined, fingerprint: string) => {
        return actor?.sub === committed?.entry.actorId && fingerprint === committed?.metadata.requestFingerprint
          ? committed
          : null;
      }),
      begin: jest.fn(() => recorder),
      record: jest.fn(
        async (
          _recorder: unknown,
          _tx: unknown,
          actor: AuthenticatedUser,
          _scope: TransferTarget | undefined,
          document: ResolvedTransferDocument,
          items: TransferItem[],
          request: { fingerprint: string; planHash: string } | undefined,
        ) => {
          if (!request) throw new Error('Replay metadata was not supplied to the journal.');
          committed = {
            entry: { id: 'batch-replay-1', actorId: actor.sub ?? '', revertedAt: null },
            metadata: {
              requestFingerprint: request.fingerprint,
              requestPlanHash: request.planHash,
              requestItems: items.map(({ kind, id, action, status, message }) => ({
                kind,
                id,
                action,
                status,
                message,
              })),
              requestSummary: { create: 0, update: 1, unchanged: 0, skip: 0 },
              document,
              synchronizationPending: false,
              undone: false,
            },
          };
          return { batchId: 'batch-replay-1', auditEntryId: 'batch-replay-1' };
        },
      ),
      synchronizationPending: jest.fn().mockResolvedValue(false),
    };
    const authorization = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
    const frozen = {
      assertEventMutable: jest.fn(),
      assertEventGroupMutable: jest.fn(),
      assertMajorEventMutable: jest.fn(),
    };

    const createService = () =>
      new DataTransferService(
        prisma as never,
        authorization as never,
        frozen as never,
        [adapter],
        new TransferKeyAllocations(),
        journal as never,
      );

    return { createService, adapterCalls, journal, prisma, committed: () => committed };
  }

  const requestDocument = () => ({
    $schema: 'urn:cacic:event-data:v1',
    format: 'cacic-event-data',
    version: 1,
    resources: [{ kind: 'group', key: 'LOCAL-GROUP', data: { name: 'New group' } }],
  });

  it('stores persisted normalized values in both the apply response and durable retry result', async () => {
    const fixture = createReplayFixture();
    const service = fixture.createService();
    const document = requestDocument();
    document.resources[0].data.name = '  New group  ';
    const preview = await service.preview({ document }, organizer());
    const request = {
      document,
      planHash: preview.planHash,
      allowPartial: false,
      allocationToken: preview.allocation?.token,
    };
    const result = await service.apply(request, organizer());
    expect(result.document?.resources[0]).toEqual({
      kind: 'group',
      id: 'stored-group-1',
      data: { name: 'New group' },
    });
    const replay = await fixture.createService().apply(request, organizer());
    expect(replay.document).toEqual(result.document);
    expect(fixture.adapterCalls.apply).toHaveBeenCalledTimes(1);
  });

  it('returns the exact committed ID after a fresh allocation cache, without opening a write transaction', async () => {
    const fixture = createReplayFixture();
    const firstService = fixture.createService();
    const document = requestDocument();
    const preview = await firstService.preview({ document }, organizer());
    const applyRequest = {
      document,
      planHash: preview.planHash,
      allowPartial: false,
      allocationToken: preview.allocation?.token,
    };
    const firstResult = await firstService.apply(applyRequest, organizer());
    const writesBeforeReplay = fixture.adapterCalls.apply.mock.calls.length;
    const transactionsBeforeReplay = fixture.prisma.$transaction.mock.calls.length;
    const secondService = fixture.createService();

    const replay = await secondService.apply(applyRequest, organizer());

    expect(firstResult.document?.resources[0]).toMatchObject({ id: 'stored-group-1' });
    expect(firstResult.document?.resources[0]).not.toHaveProperty('key');
    expect(replay).toMatchObject({
      applied: true,
      canApply: false,
      planHash: preview.planHash,
      batchId: 'batch-replay-1',
      auditEntryId: 'batch-replay-1',
      synchronizationPending: false,
    });
    expect(replay.items).toEqual(
      firstResult.items.map((item) => ({
        kind: item.kind,
        id: item.id,
        action: item.action,
        status: item.status,
        message: item.message,
        changes: [],
      })),
    );
    expect(replay.document?.resources[0]).toEqual(firstResult.document?.resources[0]);
    expect(fixture.adapterCalls.apply).toHaveBeenCalledTimes(writesBeforeReplay);
    expect(fixture.prisma.$transaction).toHaveBeenCalledTimes(transactionsBeforeReplay);
    expect(fixture.journal.findCommittedRequest).toHaveBeenLastCalledWith(organizer(), expect.any(String));
  });

  it('rechecks a concurrent committed result after acquiring the request lock and before resolving expired allocations', async () => {
    const fixture = createReplayFixture();
    const service = fixture.createService();
    const document = requestDocument();
    const preview = await service.preview({ document }, organizer());
    const request = {
      document,
      planHash: preview.planHash,
      allowPartial: false,
      allocationToken: preview.allocation?.token,
    };
    const result = await service.apply(request, organizer());
    const writes = fixture.adapterCalls.apply.mock.calls.length;
    fixture.journal.findCommittedRequest.mockResolvedValueOnce(null);
    const replay = await fixture.createService().apply(request, organizer());
    expect(replay.batchId).toBe(result.batchId);
    expect(fixture.journal.lockRequest).toHaveBeenCalled();
    expect(fixture.adapterCalls.apply).toHaveBeenCalledTimes(writes);
  });

  it.each(['changed file', 'changed token', 'different actor'] as const)(
    'does not replay a committed request after a %s',
    async (scenario) => {
      const fixture = createReplayFixture();
      const firstService = fixture.createService();
      const document = requestDocument();
      const preview = await firstService.preview({ document }, organizer());
      await firstService.apply(
        {
          document,
          planHash: preview.planHash,
          allowPartial: false,
          allocationToken: preview.allocation?.token,
        },
        organizer(),
      );
      const writesBeforeRetry = fixture.adapterCalls.apply.mock.calls.length;
      const secondService = fixture.createService();
      const actor = scenario === 'different actor' ? { ...organizer(), sub: 'another-organizer' } : organizer();
      const retryDocument =
        scenario === 'changed file'
          ? { ...document, resources: [{ ...document.resources[0], data: { name: 'Changed group' } }] }
          : document;
      const allocationToken = scenario === 'changed token' ? 'f'.repeat(64) : preview.allocation?.token;

      await expect(
        secondService.apply(
          {
            document: retryDocument,
            planHash: preview.planHash,
            allowPartial: false,
            allocationToken,
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(fixture.adapterCalls.apply).toHaveBeenCalledTimes(writesBeforeRetry);
      expect(fixture.journal.findCommittedRequest).toHaveBeenLastCalledWith(actor, expect.any(String));
    },
  );

  it('does not replay an ID-based request reviewed with a different plan hash', async () => {
    const fixture = createReplayFixture();
    const document = {
      $schema: 'urn:cacic:event-data:v1',
      format: 'cacic-event-data',
      version: 1,
      resources: [{ kind: 'group', id: 'source-group-id', data: { name: 'New group' } }],
    };
    const firstService = fixture.createService();
    const preview = await firstService.preview({ document }, organizer());
    await firstService.apply({ document, planHash: preview.planHash, allowPartial: false }, organizer());
    const writesBeforeRetry = fixture.adapterCalls.apply.mock.calls.length;
    const secondService = fixture.createService();

    await expect(
      secondService.apply(
        {
          document,
          planHash: 'f'.repeat(64),
          allowPartial: false,
        },
        organizer(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(fixture.adapterCalls.apply).toHaveBeenCalledTimes(writesBeforeRetry);
    expect(fixture.journal.findCommittedRequest).toHaveBeenLastCalledWith(organizer(), expect.any(String));
  });

  it.each([
    ['source read permission was revoked', new ForbiddenException()],
    ['the committed batch was undone', new ConflictException('Este lote já foi desfeito.')],
  ])('refuses replay when %s', async (_reason, failure) => {
    const fixture = createReplayFixture();
    const service = fixture.createService();
    const document = requestDocument();
    const preview = await service.preview({ document }, organizer());
    fixture.journal.findCommittedRequest.mockRejectedValueOnce(failure);

    await expect(
      service.apply(
        {
          document,
          planHash: preview.planHash,
          allowPartial: false,
          allocationToken: preview.allocation?.token,
        },
        organizer(),
      ),
    ).rejects.toBe(failure);

    expect(fixture.adapterCalls.apply).not.toHaveBeenCalled();
    expect(fixture.journal.begin).not.toHaveBeenCalled();
  });
});

function row(
  kind: TransferResourceKind,
  id: string,
  data: Record<string, unknown>,
  sourceIndex: number,
  dependencyOrder = 10,
): TransferDependencyRow {
  const resource = { kind, id, data } as TransferResource;
  return {
    adapter: { dependencyOrder },
    snapshot: { resource, dependencies: [], ownedBy: undefined },
    action: 'create',
    status: 'ready',
    item: { kind, id },
    sourceIndex,
  };
}

type PlannerStateRow = TransferDependencyRow & {
  snapshot: NonNullable<TransferDependencyRow['snapshot']>;
  action: TransferDependencyRow['action'];
  status: TransferDependencyRow['status'];
  item: TransferItem;
};

function stateRow(
  kind: TransferResourceKind,
  id: string,
  data: Record<string, unknown>,
  sourceIndex: number,
  status: 'ready' | 'blocked' = 'ready',
): PlannerStateRow {
  const resource = { kind, id, data } as TransferResource;
  const blocked = status === 'blocked';
  return {
    adapter: { dependencyOrder: 10 },
    snapshot: { resource, dependencies: [], ownedBy: undefined },
    action: blocked ? 'skip' : 'create',
    status,
    item: {
      kind,
      id,
      action: blocked ? 'skip' : 'create',
      status,
      message: blocked ? 'Blocked root.' : 'Ready.',
      changes: blocked ? [] : [{ field: 'name', before: null, after: 'new' }],
    },
    sourceIndex,
  };
}

function callDependencyPropagation(service: DataTransferService, rows: PlannerStateRow[]): void {
  const planner = service as unknown as { applyOwnerAndDependencyState(rows: unknown[]): void };
  planner.applyOwnerAndDependencyState(rows);
}

function createServiceForPlan(
  adapters: DataTransferAdapter[] = [],
  prisma: Record<string, unknown> = {
    $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation({})),
  },
  journal?: Record<string, unknown>,
  authorization: Record<string, unknown> = { assertPermissions: jest.fn().mockResolvedValue(undefined) },
): DataTransferService {
  return new DataTransferService(
    prisma as never,
    authorization as never,
    {
      assertEventMutable: jest.fn().mockResolvedValue(undefined),
      assertEventGroupMutable: jest.fn().mockResolvedValue(undefined),
      assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
    } as never,
    adapters,
    new TransferKeyAllocations(),
    journal as never,
  );
}

function createPlanningAdapter(
  kinds: readonly TransferResourceKind[],
  calls: Record<'read' | 'write' | 'mutable' | 'validate' | 'apply', jest.Mock>,
  resolve: (resource: TransferResource) => Promise<ResolvedTransferResource>,
): DataTransferAdapter {
  return {
    kinds,
    dependencyOrder: 10,
    resolve: jest.fn(resolve),
    assertRead: calls.read,
    assertWrite: calls.write,
    assertMutable: calls.mutable,
    validate: calls.validate,
    apply: calls.apply,
    exportTarget: jest.fn().mockResolvedValue({ resources: [], issues: [] }),
  };
}

function organizer(): AuthenticatedUser {
  return { sub: 'organizer-1' } as AuthenticatedUser;
}

function aliasDocument(aliasCurrent?: Record<string, unknown> | null) {
  const startDate =
    typeof aliasCurrent?.['startDate'] === 'string'
      ? aliasCurrent['startDate']
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const endDate =
    typeof aliasCurrent?.['endDate'] === 'string'
      ? aliasCurrent['endDate']
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString();
  return {
    $schema: 'urn:cacic:event-data:v1',
    format: 'cacic-event-data',
    version: 1,
    resources: [
      { kind: 'group', id: 'group-1', data: { name: 'New group' } },
      { kind: 'event', id: 'event-1', data: { name: 'New event', eventGroupId: 'group-1', startDate, endDate } },
    ],
  };
}
