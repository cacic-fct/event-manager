import { PublicationState } from '@cacic-fct/shared-data-types';
import { PUBLISH_SCHEDULED_CONTENT_JOB } from './publishing.constants';
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
    const service = new PublicationJobsService({} as never, {} as never, {} as never, publicationQueue as never);
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
});
