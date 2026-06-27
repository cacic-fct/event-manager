import { PublicationState } from '@cacic-fct/shared-data-types';
import { CLEANUP_STALE_EVENT_DRAFTS_JOB, PUBLISH_SCHEDULED_CONTENT_JOB } from './publishing.constants';
import { PublicationJobsService } from './publishing-jobs.service';

describe('PublicationJobsService', () => {
  const now = new Date('2026-06-25T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('includes the scheduled timestamp in delayed job ids so reschedules enqueue a fresh job', async () => {
    const publicationQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const service = new PublicationJobsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      publicationQueue as never,
    );
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

  it('schedules stale event draft cleanup on the publication queue', async () => {
    const publicationQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const prisma = {
      event: { findMany: jest.fn().mockResolvedValue([]) },
      majorEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new PublicationJobsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      publicationQueue as never,
    );

    await service.schedulePublicationJobs();

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
  });

  it('runs stale event draft cleanup through the draft service', async () => {
    const eventDrafts = {
      cleanupStaleDrafts: jest.fn().mockResolvedValue(3),
    };
    const service = new PublicationJobsService(
      {} as never,
      {} as never,
      {} as never,
      eventDrafts as never,
      { add: jest.fn() } as never,
    );

    await service.cleanupStaleEventDrafts();

    expect(eventDrafts.cleanupStaleDrafts).toHaveBeenCalledWith();
  });
});
