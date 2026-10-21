import { Logger } from '@nestjs/common';
import { DataTransferRecoveryService } from './data-transfer-recovery.service';
const { jest } = import.meta;

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
    people: { findMany: jest.fn().mockResolvedValue([{ userId: 'holder-user' }]) },
    placePreset: { findUnique: jest.fn().mockResolvedValue(null) },
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
    isEnabled: jest.fn().mockReturnValue(true),
    upsertPlacePreset: jest.fn().mockResolvedValue(undefined),
    deletePlacePreset: jest.fn().mockResolvedValue(undefined),
    upsertMajorEvent: jest.fn().mockResolvedValue(undefined),
    deleteMajorEvent: jest.fn().mockResolvedValue(undefined),
    upsertAuditLogEntry: jest.fn().mockResolvedValue(undefined),
  };
  const sportsEvents = {
    publishForEntity: jest.fn().mockResolvedValue(undefined),
    publishForDeletedEntity: jest.fn().mockResolvedValue(undefined),
    publishAttendanceMutation: jest.fn().mockResolvedValue(undefined),
  };
  const realtime = { scope: (channel: string) => channel, publish: jest.fn().mockResolvedValue(undefined) };
  const attendanceRealtime = { notifyAllConnectedPeople: jest.fn().mockResolvedValue(undefined) };
  const ticketRealtime = { enqueueForUsers: jest.fn().mockResolvedValue(undefined) };
  const service = new DataTransferRecoveryService(
    prisma as never,
    journal as never,
    effects as never,
    search as never,
    sportsEvents as never,
    realtime as never,
    attendanceRealtime as never,
    ticketRealtime as never,
  );

  return { service, prisma, journal, effects, search, sportsEvents, realtime, attendanceRealtime, ticketRealtime };
}

describe('DataTransferRecoveryService', () => {
  it.each([false, true])(
    'enqueues restored publication schedules after import or undo (undone: %s)',
    async (undone) => {
      const scheduledPublishAt = new Date(Date.now() + 60 * 60 * 1000);
      const batch = entry(
        'scheduled-batch',
        metadata([mutation('event', 'event-1', {}, 'event'), mutation('major-event', 'major-1', {}, 'majorEvent')], {
          undone,
        }),
      );
      const state = fixture([batch]);
      const scheduled = { publicationState: 'SCHEDULED', scheduledPublishAt };
      Object.assign(state.prisma, { event: { findUnique: jest.fn().mockResolvedValue(scheduled) } });
      state.prisma.majorEvent.findUnique.mockResolvedValue(scheduled as never);
      const jobs = { enqueueScheduledJobs: jest.fn().mockResolvedValue(undefined) };
      const service = new DataTransferRecoveryService(
        state.prisma as never,
        state.journal as never,
        state.effects as never,
        state.search as never,
        state.sportsEvents as never,
        state.realtime as never,
        state.attendanceRealtime as never,
        state.ticketRealtime as never,
        jobs as never,
      );
      await service.recoverPending();
      expect(jobs.enqueueScheduledJobs).toHaveBeenCalledWith('SCHEDULED', scheduledPublishAt, {
        eventIds: ['event-1'],
        majorEventIds: [],
      });
      expect(jobs.enqueueScheduledJobs).toHaveBeenCalledWith('SCHEDULED', scheduledPublishAt, {
        eventIds: [],
        majorEventIds: ['major-1'],
      });
      expect(state.journal.markSynchronized).toHaveBeenCalledWith('scheduled-batch', undone);
    },
  );

  it.each([false, true])('refreshes ticket holders and purchases after import/undo (undone: %s)', async (undone) => {
    const source = mutation('event-ticket', 'ticket-1', { eventId: 'event-1' }, 'eventTicket');
    source.before = { id: 'ticket-1', eventId: 'event-1', holderPersonId: 'old-holder' };
    source.after = { id: 'ticket-1', eventId: 'event-1', holderPersonId: 'new-holder' };
    const batch = entry('batch-tickets', metadata([source], { undone }));
    const { service, prisma, ticketRealtime, journal } = fixture([batch]);
    await service.recoverPending();
    expect(prisma.people.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-holder', 'new-holder'] } },
      select: { userId: true },
    });
    expect(ticketRealtime.enqueueForUsers).toHaveBeenCalledWith(prisma, ['holder-user'], {
      type: 'TICKETS_CHANGED',
      eventId: 'event-1',
    });
    expect(ticketRealtime.enqueueForUsers).toHaveBeenCalledWith(prisma, ['holder-user'], {
      type: 'PURCHASES_CHANGED',
      eventId: 'event-1',
    });
    expect(journal.markSynchronized).toHaveBeenCalledWith(batch.id, undone);
  });

  it('completes non-search recovery when Typesense is disabled', async () => {
    const batch = entry(
      'batch-disabled-search',
      metadata(
        [
          mutation('form-link', 'link-1', { majorEventId: 'major-1' }, 'eventFormLink'),
          mutation('place-preset', 'place-1', {}, 'placePreset'),
        ],
        { auditEntryIds: ['unavailable-audit'] },
      ),
    );
    batch.metadata.mutations[0].after = { id: 'link-1', formId: 'form-1' };
    const { service, search, effects, realtime, journal } = fixture([batch]);
    search.isEnabled.mockReturnValue(false);
    search.upsertAuditLogEntry.mockRejectedValue(new Error('disabled client'));
    await service.recoverPending();
    expect(effects.syncEvents).toHaveBeenCalledWith([], { throwOnSearchError: false });
    expect(search.upsertMajorEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'major-1' }), false);
    expect(search.deletePlacePreset).toHaveBeenCalledWith('place-1', false);
    expect(search.upsertAuditLogEntry).not.toHaveBeenCalled();
    expect(realtime.publish).toHaveBeenCalled();
    expect(journal.markSynchronized).toHaveBeenCalledWith(batch.id, false);
  });

  it('retries enabled audit indexing failures before marking a batch synchronized', async () => {
    const batch = entry('batch-search-failure', metadata([]));
    const { service, search, journal } = fixture([batch]);
    search.upsertAuditLogEntry.mockRejectedValueOnce(new Error('search unavailable'));
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      await service.recoverPending();
      expect(journal.markSynchronized).not.toHaveBeenCalled();
      await service.recoverPending();
      expect(journal.markSynchronized).toHaveBeenCalledWith(batch.id, false);
    } finally {
      warning.mockRestore();
    }
  });

  it.each([false, true])('recovers place search documents after import and undo (undone: %s)', async (undone) => {
    const source = mutation('place-preset', 'place-1', {}, 'placePreset');
    source.source.action = 'create';
    const batch = entry('batch-place', metadata([source], { undone }));
    const { service, prisma, journal, search } = fixture([batch]);
    if (!undone)
      prisma.placePreset.findUnique.mockResolvedValue({
        id: 'place-1',
        name: 'Ginásio',
        locationDescription: null,
        deletedAt: null,
      } as never);
    await service.recoverPending();
    if (undone) expect(search.deletePlacePreset).toHaveBeenCalledWith('place-1', true);
    else
      expect(search.upsertPlacePreset).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'place-1', name: 'Ginásio' }),
        true,
      );
    expect(journal.markSynchronized).toHaveBeenCalledWith('batch-place', undone);
  });

  it('keeps a failed place search update pending until it succeeds', async () => {
    const batch = entry('batch-place', metadata([mutation('place-preset', 'place-1', {}, 'placePreset')]));
    const { service, prisma, journal, search } = fixture([batch]);
    prisma.placePreset.findUnique.mockResolvedValue({ id: 'place-1', name: 'Ginásio', deletedAt: null } as never);
    search.upsertPlacePreset.mockRejectedValueOnce(new Error('search unavailable'));
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      await service.recoverPending();
      expect(journal.markSynchronized).not.toHaveBeenCalled();
      await service.recoverPending();
      expect(journal.markSynchronized).toHaveBeenCalledWith('batch-place', false);
    } finally {
      warning.mockRestore();
    }
  });

  it.each(['sports-category', 'sports-venue', 'sports-match', 'sports-tournament'])(
    'recovers hard-deleted %s from its journaled tournament scope',
    async (kind) => {
      const source = mutation(kind, 'deleted-1', { sportsTournamentId: 'tournament-1' });
      source.source.action = 'create';
      const batch = entry('batch-deleted', metadata([source], { undone: true }));
      const { service, journal, sportsEvents } = fixture([batch]);
      await service.recoverPending();
      expect(sportsEvents.publishForEntity).not.toHaveBeenCalled();
      expect(sportsEvents.publishForDeletedEntity).toHaveBeenCalledWith(
        expect.any(String),
        'deleted-1',
        kind === 'sports-tournament' ? 'deleted-1' : 'tournament-1',
      );
      expect(journal.markSynchronized).toHaveBeenCalledWith('batch-deleted', true);
    },
  );

  it.each([false, true])(
    'replays form and attendance invalidations before completing recovery (undone: %s)',
    async (undone) => {
      const link = mutation('form-link', 'link-1', {}, 'eventFormLink');
      link.after = { id: 'link-1', formId: 'form-linked' };
      const attendance = mutation('event-attendance', 'attendance-1', {}, 'eventAttendance');
      attendance.after = { eventId: 'event-attended', personId: 'person-1' };
      const batch = entry(
        'batch-notifications',
        metadata(
          [
            mutation('event-form', 'form-1', {}, 'eventForm'),
            link,
            attendance,
            mutation('event', 'event-1', {}, 'event'),
          ],
          { undone },
        ),
      );
      const { service, journal, realtime, attendanceRealtime, sportsEvents } = fixture([batch]);
      await service.recoverPending();
      expect(realtime.publish).toHaveBeenCalledWith(
        'admin-workspace',
        expect.objectContaining({
          type: 'EVENT_FORMS_INVALIDATED',
          formId: 'form-linked',
        }),
      );
      expect(realtime.publish).toHaveBeenCalledWith(
        'admin-workspace',
        expect.objectContaining({
          type: 'EVENT_FORMS_INVALIDATED',
          formId: 'form-1',
        }),
      );
      expect(sportsEvents.publishAttendanceMutation).toHaveBeenCalledWith('event-attended');
      expect(attendanceRealtime.notifyAllConnectedPeople).toHaveBeenCalledTimes(1);
      expect(journal.markSynchronized).toHaveBeenCalledWith('batch-notifications', undone);
      expect(journal.markSynchronized.mock.invocationCallOrder[0]).toBeGreaterThan(
        attendanceRealtime.notifyAllConnectedPeople.mock.invocationCallOrder[0],
      );
    },
  );

  it('keeps failed realtime effects pending and replays them on retry', async () => {
    const batch = entry('batch-notifications', metadata([mutation('event-form', 'form-1', {}, 'eventForm')]));
    const { service, journal, realtime } = fixture([batch]);
    realtime.publish.mockRejectedValueOnce(new Error('realtime unavailable'));
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      await service.recoverPending();
      expect(journal.markSynchronized).not.toHaveBeenCalled();
      await service.recoverPending();
      expect(journal.markSynchronized).toHaveBeenCalledWith('batch-notifications', false);
    } finally {
      warning.mockRestore();
    }
  });

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
