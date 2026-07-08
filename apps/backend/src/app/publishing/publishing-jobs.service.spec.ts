import { PublicationState } from '@cacic-fct/shared-data-types';
import {
  CLEANUP_STALE_EVENT_DRAFTS_JOB,
  PUBLISH_SCHEDULED_CONTENT_JOB,
  RECONCILE_PUBLICATION_STATES_JOB,
} from './publishing.constants';
import { PublicationJobsService } from './publishing-jobs.service';

describe('PublicationJobsService', () => {
  const now = new Date('2026-06-25T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('includes the scheduled timestamp in delayed job ids so reschedules enqueue a fresh job', async () => {
    const { publicationQueue, service } = createService();
    const firstSchedule = new Date('2026-06-25T13:00:00.000Z');
    const secondSchedule = new Date('2026-06-25T14:00:00.000Z');

    await service.enqueueScheduledJobs(PublicationState.SCHEDULED, firstSchedule, {
      eventIds: ['event-1'],
      majorEventIds: [],
    });
    await service.enqueueScheduledJobs(PublicationState.SCHEDULED, secondSchedule, {
      eventIds: ['event-1'],
      majorEventIds: [],
    });

    expect(publicationQueue.add).toHaveBeenNthCalledWith(
      1,
      PUBLISH_SCHEDULED_CONTENT_JOB,
      { targetType: 'EVENT', targetId: 'event-1' },
      expect.objectContaining({
        jobId: `publication:EVENT:event-1:publish:${firstSchedule.getTime()}`,
        delay: firstSchedule.getTime() - now.getTime(),
      }),
    );
    expect(publicationQueue.add).toHaveBeenNthCalledWith(
      2,
      PUBLISH_SCHEDULED_CONTENT_JOB,
      { targetType: 'EVENT', targetId: 'event-1' },
      expect.objectContaining({
        jobId: `publication:EVENT:event-1:publish:${secondSchedule.getTime()}`,
        delay: secondSchedule.getTime() - now.getTime(),
      }),
    );
  });

  it('does not enqueue delayed jobs when the target is not scheduled or has no scheduled timestamp', async () => {
    const { publicationQueue, service } = createService();

    await service.enqueueScheduledJobs(PublicationState.PUBLISHED, now, {
      eventIds: ['event-1'],
      majorEventIds: ['major-1'],
    });
    await service.enqueueScheduledJobs(PublicationState.SCHEDULED, null, {
      eventIds: ['event-2'],
      majorEventIds: ['major-2'],
    });

    expect(publicationQueue.add).not.toHaveBeenCalled();
  });

  it('schedules maintenance jobs and requeues pending scheduled content', async () => {
    const { prisma, publicationQueue, service } = createService();
    const eventSchedule = new Date('2026-06-25T12:10:00.000Z');
    const majorEventSchedule = new Date('2026-06-25T11:55:00.000Z');
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1', scheduledPublishAt: eventSchedule }]);
    prisma.majorEvent.findMany.mockResolvedValue([
      { id: 'major-1', scheduledPublishAt: majorEventSchedule },
    ]);

    await service.schedulePublicationJobs();

    expect(publicationQueue.add).toHaveBeenCalledWith(
      RECONCILE_PUBLICATION_STATES_JOB,
      {},
      expect.objectContaining({
        jobId: `publication:${RECONCILE_PUBLICATION_STATES_JOB}`,
        repeat: expect.objectContaining({
          pattern: '*/5 * * * *',
          tz: 'America/Sao_Paulo',
        }),
      }),
    );
    expect(publicationQueue.add).toHaveBeenCalledWith(
      CLEANUP_STALE_EVENT_DRAFTS_JOB,
      {},
      expect.objectContaining({
        jobId: `publication:${CLEANUP_STALE_EVENT_DRAFTS_JOB}`,
        repeat: expect.objectContaining({
          pattern: '17 3 * * *',
          tz: 'America/Sao_Paulo',
        }),
      }),
    );
    expect(publicationQueue.add).toHaveBeenCalledWith(
      PUBLISH_SCHEDULED_CONTENT_JOB,
      { targetType: 'EVENT', targetId: 'event-1' },
      expect.objectContaining({
        jobId: `publication:EVENT:event-1:publish:${eventSchedule.getTime()}`,
        delay: eventSchedule.getTime() - now.getTime(),
      }),
    );
    expect(publicationQueue.add).toHaveBeenCalledWith(
      PUBLISH_SCHEDULED_CONTENT_JOB,
      { targetType: 'MAJOR_EVENT', targetId: 'major-1' },
      expect.objectContaining({
        jobId: `publication:MAJOR_EVENT:major-1:publish:${majorEventSchedule.getTime()}`,
        delay: 0,
      }),
    );
  });

  it('publishes scheduled events and syncs search when the target is due', async () => {
    const { prisma, searchSync, service, transitions } = createService();
    const sync = { eventIds: ['event-1'], majorEventIds: [] };
    prisma.event.findFirst.mockResolvedValue({ id: 'event-1' });
    transitions.publishEventById.mockResolvedValue(sync);

    await service.processScheduledPublication({ targetType: 'EVENT', targetId: 'event-1' });

    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'event-1',
        deletedAt: null,
        publicationState: PublicationState.SCHEDULED,
        scheduledPublishAt: { lte: now },
      },
      select: { id: true },
    });
    expect(transitions.publishEventById).toHaveBeenCalledWith('event-1', null);
    expect(searchSync.syncSearch).toHaveBeenCalledWith(sync);
  });

  it('publishes scheduled major events and skips stale jobs that are no longer due', async () => {
    const { prisma, searchSync, service, transitions } = createService();
    const sync = { eventIds: ['event-1'], majorEventIds: ['major-1'] };
    prisma.majorEvent.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'major-1' });
    transitions.publishMajorEventById.mockResolvedValue(sync);

    await service.processScheduledPublication({ targetType: 'MAJOR_EVENT', targetId: 'stale-major' });
    await service.processScheduledPublication({ targetType: 'MAJOR_EVENT', targetId: 'major-1' });

    expect(transitions.publishMajorEventById).toHaveBeenCalledTimes(1);
    expect(transitions.publishMajorEventById).toHaveBeenCalledWith('major-1', null);
    expect(searchSync.syncSearch).toHaveBeenCalledWith(sync);
  });

  it('reconciles due scheduled targets, logs failures, trims previews, and syncs successful publications', async () => {
    const { prisma, searchSync, service, transitions } = createService();
    const failure = new Error('publish failed');
    const eventSync = { eventIds: ['event-1'], majorEventIds: [] };
    const majorEventSync = { eventIds: ['event-3'], majorEventIds: ['major-1'] };
    const mergedSync = { eventIds: ['event-1', 'event-3'], majorEventIds: ['major-1'] };
    const loggerError = jest.spyOn(service['logger'], 'error').mockImplementation();
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1' }, { id: 'event-2' }]);
    prisma.majorEvent.findMany.mockResolvedValue([{ id: 'major-1' }]);
    transitions.publishEventById.mockResolvedValueOnce(eventSync).mockRejectedValueOnce(failure);
    transitions.publishMajorEventById.mockResolvedValue(majorEventSync);
    transitions.mergeSync.mockReturnValue(mergedSync);

    await service.reconcileScheduledPublications();

    expect(transitions.publishEventById).toHaveBeenCalledWith('event-1', null);
    expect(transitions.publishEventById).toHaveBeenCalledWith('event-2', null);
    expect(transitions.publishMajorEventById).toHaveBeenCalledWith('major-1', null);
    expect(loggerError).toHaveBeenCalledWith(
      'Failed to publish scheduled EVENT event-2.',
      failure.stack,
    );
    expect(transitions.mergeSync).toHaveBeenCalledWith([eventSync, majorEventSync]);
    expect(searchSync.syncSearch).toHaveBeenCalledWith(mergedSync);
    expect(prisma.publicContentPreview.deleteMany).toHaveBeenCalledWith({
      where: { trimAfter: { lte: now } },
    });
  });

  it('runs stale event draft cleanup through the draft service and logs deleted batches', async () => {
    const { eventDrafts, service } = createService();
    const loggerLog = jest.spyOn(service['logger'], 'log').mockImplementation();
    eventDrafts.cleanupStaleDrafts.mockResolvedValue(3);

    await service.cleanupStaleEventDrafts();

    expect(eventDrafts.cleanupStaleDrafts).toHaveBeenCalledWith();
    expect(loggerLog).toHaveBeenCalledWith('Deleted 3 stale event draft(s).');
  });

  it('does not log stale event draft cleanup when nothing was deleted', async () => {
    const { eventDrafts, service } = createService();
    const loggerLog = jest.spyOn(service['logger'], 'log').mockImplementation();
    eventDrafts.cleanupStaleDrafts.mockResolvedValue(0);

    await service.cleanupStaleEventDrafts();

    expect(loggerLog).not.toHaveBeenCalled();
  });
});

function createService() {
  const prisma = {
    event: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    majorEvent: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    publicContentPreview: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const transitions = {
    publishEventById: jest.fn(),
    publishMajorEventById: jest.fn(),
    mergeSync: jest.fn().mockReturnValue({ eventIds: [], majorEventIds: [] }),
  };
  const searchSync = {
    syncSearch: jest.fn().mockResolvedValue(undefined),
  };
  const eventDrafts = {
    cleanupStaleDrafts: jest.fn().mockResolvedValue(0),
  };
  const publicationQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };
  const service = new PublicationJobsService(
    prisma as never,
    transitions as never,
    searchSync as never,
    eventDrafts as never,
    publicationQueue as never,
  );

  return {
    eventDrafts,
    prisma,
    publicationQueue,
    searchSync,
    service,
    transitions,
  };
}
