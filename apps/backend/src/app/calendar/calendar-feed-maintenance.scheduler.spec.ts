import { CalendarFeedMaintenanceScheduler } from './calendar-feed-maintenance.scheduler';
import { DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB } from './calendar.models';

describe('CalendarFeedMaintenanceScheduler', () => {
  it('registers weekly stale admin calendar feed maintenance in Sao Paulo time', async () => {
    const queue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const scheduler = new CalendarFeedMaintenanceScheduler(queue as never);

    await scheduler.onModuleInit();

    expect(queue.add).toHaveBeenCalledWith(
      DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB,
      {},
      {
        jobId: `calendar:${DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB}`,
        repeat: {
          pattern: '0 3 * * 0',
          tz: 'America/Sao_Paulo',
        },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  });
});
