import { Logger } from '@nestjs/common';
import { DataTransferRecoveryService } from './data-transfer-recovery.service';

type MutationFixture = {
  model: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  source: { kind: string; id: string; action: 'create' | 'update'; scope: Record<string, unknown> };
};

function mutation(
  kind: string,
  id: string,
  scope: Record<string, unknown> = {},
  model = 'ticketConfig',
): MutationFixture {
  return {
    model,
    before: null,
    after: { id },
    source: { kind, id, action: 'update', scope },
  };
}

function metadata(mutations: MutationFixture[], overrides: Record<string, unknown> = {}) {
  return {
    type: 'data-transfer-batch',
    version: 1,
    schemaFingerprint: 'schema-fingerprint',
    summary: { create: 0, update: mutations.length, unchanged: 0, skip: 0 },
    mutations,
    document: { format: 'cacic-event-data', version: 1, resources: [] },
    auditEntryIds: [],
    synchronizationPending: true,
    undone: false,
    ...overrides,
  };
}

function entry(id: string, batchMetadata: ReturnType<typeof metadata>, overrides: Record<string, unknown> = {}) {
  return {
    id,
    metadata: batchMetadata,
    revertedAt: null,
    revertedByEntryId: null,
    ...overrides,
  };
}

function fixture(entries: unknown[]) {
  const prisma = {
    auditLogEntry: { findMany: jest.fn().mockResolvedValue(entries) },
    majorEvent: {
      findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        name: `Grande ${where.id}`,
        description: null,
        startDate: new Date(Date.now() + 60 * 60 * 1000),
        endDate: new Date(Date.now() + 25 * 60 * 60 * 1000),
        publicationState: 'DRAFT',
        deletedAt: null,
      })),
    },
    sportsCategory: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    sportsMatch: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const journal = { markSynchronized: jest.fn().mockResolvedValue(undefined) };
  const effects = {
    syncEvents: jest.fn().mockResolvedValue(undefined),
    syncEventGroups: jest.fn().mockResolvedValue(undefined),
    refreshCatalogsAndSitemap: jest.fn().mockResolvedValue(undefined),
  };
  const search = {
    upsertMajorEvent: jest.fn().mockResolvedValue(undefined),
    deleteMajorEvent: jest.fn().mockResolvedValue(undefined),
    upsertAuditLogEntry: jest.fn().mockResolvedValue(undefined),
  };
  const sportsEvents = { publishForEntity: jest.fn().mockResolvedValue(undefined) };
  const service = new DataTransferRecoveryService(
    prisma as never,
    journal as never,
    effects as never,
    search as never,
    sportsEvents as never,
  );

  return { service, prisma, journal, effects, search, sportsEvents };
}

describe('DataTransferRecoveryService', () => {
  it('replays undone configuration-only batches using source scopes and refreshes linked audit entries', async () => {
    const batchMetadata = metadata(
      [
        mutation('ticket-config', 'ticket-config-1', {
          eventId: 'event-from-scope',
          eventGroupId: 'group-from-scope',
          majorEventId: 'major-from-scope',
        }),
      ],
      { undone: true, auditEntryIds: ['domain-audit-1'] },
    );
    const batchEntry = entry('batch-1', batchMetadata, { revertedAt: new Date(), revertedByEntryId: 'revert-audit-1' });
    const domainAuditEntry = { id: 'domain-audit-1', revertedAt: new Date(), revertedByEntryId: 'revert-audit-1' };
    const revertAuditEntry = { id: 'revert-audit-1', revertedAt: null, revertedByEntryId: null };
    const { service, prisma, journal, effects, search } = fixture([batchEntry]);
    prisma.auditLogEntry.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      const ids = (where['id'] as { in?: string[] } | undefined)?.in;
      if (ids) return [domainAuditEntry, revertAuditEntry].filter((row) => ids.includes(row.id));
      return [batchEntry];
    });

    await service.recoverPending();

    expect(effects.syncEvents).toHaveBeenCalledWith(['event-from-scope'], { throwOnSearchError: true });
    expect(effects.syncEventGroups).toHaveBeenCalledWith(['group-from-scope'], { throwOnSearchError: true });
    expect(search.upsertMajorEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'major-from-scope' }), true);
    expect(effects.refreshCatalogsAndSitemap).toHaveBeenCalledTimes(1);
    expect(search.upsertAuditLogEntry).toHaveBeenCalledWith(domainAuditEntry, true);
    expect(search.upsertAuditLogEntry).toHaveBeenCalledWith(revertAuditEntry, true);
    expect(search.upsertAuditLogEntry).toHaveBeenCalledWith(batchEntry, true);
    expect(journal.markSynchronized).toHaveBeenCalledWith('batch-1', true);
  });

  it('publishes each sports setup entity and maps stage changes to their category', async () => {
    const batchMetadata = metadata([
      mutation('sports-tournament', 'tournament-1', { majorEventId: 'major-shared' }, 'sportsTournament'),
      mutation(
        'sports-category',
        'category-1',
        { eventGroupId: 'group-shared', majorEventId: 'major-shared' },
        'sportsCategory',
      ),
      mutation('sports-venue', 'venue-1', { majorEventId: 'major-shared' }, 'sportsVenue'),
      mutation(
        'sports-match',
        'match-1',
        { eventId: 'event-shared', eventGroupId: 'group-shared', majorEventId: 'major-shared' },
        'sportsMatch',
      ),
      mutation(
        'sports-stage',
        'stage-1',
        { sportsCategoryId: 'category-1', eventGroupId: 'group-shared', majorEventId: 'major-shared' },
        'sportsStage',
      ),
    ]);
    const batchEntry = entry('batch-sports', batchMetadata);
    const { service, prisma, effects, sportsEvents } = fixture([batchEntry]);
    prisma.sportsCategory.findUnique.mockResolvedValue({
      eventGroupId: 'group-category',
      tournament: { majorEventId: 'major-category' },
      matches: [{ eventId: 'event-category' }],
    });
    prisma.sportsCategory.findMany.mockResolvedValue([
      {
        eventGroupId: 'group-tournament',
        tournament: { majorEventId: 'major-tournament' },
        matches: [{ eventId: 'event-tournament' }],
      },
    ]);
    prisma.sportsMatch.findMany.mockResolvedValue([{ eventId: 'event-venue' }]);
    prisma.sportsMatch.findUnique.mockResolvedValue({
      eventId: 'event-match',
      category: { eventGroupId: 'group-match', tournament: { majorEventId: 'major-match' } },
    });

    await service.recoverPending();

    expect(effects.syncEvents).toHaveBeenCalledWith(
      expect.arrayContaining(['event-shared', 'event-category', 'event-tournament', 'event-venue', 'event-match']),
      { throwOnSearchError: true },
    );
    expect(effects.syncEventGroups).toHaveBeenCalledWith(
      expect.arrayContaining(['group-shared', 'group-category', 'group-tournament', 'group-match']),
      { throwOnSearchError: true },
    );
    expect(sportsEvents.publishForEntity).toHaveBeenCalledTimes(4);
    expect(sportsEvents.publishForEntity).toHaveBeenCalledWith('TOURNAMENT', 'tournament-1', true);
    expect(sportsEvents.publishForEntity).toHaveBeenCalledWith('CATEGORY', 'category-1', true);
    expect(sportsEvents.publishForEntity).toHaveBeenCalledWith('VENUE', 'venue-1', true);
    expect(sportsEvents.publishForEntity).toHaveBeenCalledWith('MATCH', 'match-1', true);
  });

  it('leaves failed strict search synchronization pending for retry', async () => {
    const batchMetadata = metadata([mutation('ticket-config', 'ticket-config-1', { eventId: 'event-pending' })]);
    const batchEntry = entry('batch-pending', batchMetadata);
    const { service, journal, effects, search } = fixture([batchEntry]);
    effects.syncEvents.mockRejectedValueOnce(new Error('event index unavailable'));
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    try {
      await service.recoverPending();
    } finally {
      warning.mockRestore();
    }

    expect(effects.syncEvents).toHaveBeenCalledWith(['event-pending'], { throwOnSearchError: true });
    expect(search.upsertAuditLogEntry).not.toHaveBeenCalled();
    expect(journal.markSynchronized).not.toHaveBeenCalled();
  });

  it('coalesces concurrent calls into one outbox scan and waits for the active recovery', async () => {
    let releaseScan!: () => void;
    let signalScanStarted!: () => void;
    const scanGate = new Promise<void>((resolve) => {
      releaseScan = resolve;
    });
    const scanStarted = new Promise<void>((resolve) => {
      signalScanStarted = resolve;
    });
    const { service, prisma } = fixture([]);
    prisma.auditLogEntry.findMany.mockImplementation(async () => {
      signalScanStarted();
      await scanGate;
      return [];
    });

    const first = service.recoverPending();
    await scanStarted;
    const second = service.recoverPending();
    expect(prisma.auditLogEntry.findMany).toHaveBeenCalledTimes(1);
    let secondCompleted = false;
    void second.then(() => {
      secondCompleted = true;
    });
    await Promise.resolve();
    expect(secondCompleted).toBe(false);

    releaseScan();
    await Promise.all([first, second]);
    expect(secondCompleted).toBe(true);
  });
});
