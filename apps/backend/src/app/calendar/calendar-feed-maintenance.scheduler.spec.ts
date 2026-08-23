import { CalendarFeedMaintenanceScheduler } from './calendar-feed-maintenance.scheduler';
import { DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB } from './calendar.models';

describe('CalendarFeedMaintenanceScheduler', () => {
  it('registers weekly stale admin calendar feed maintenance in Sao Paulo time', async () => {
    const queue = {
      upsertJobScheduler: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const scheduler = new CalendarFeedMaintenanceScheduler(queue as never);

    await scheduler.onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      `calendar-${DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB}`,
      {
        pattern: '0 3 * * 0',
        tz: 'America/Sao_Paulo',
      },
      {
        name: DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB,
        data: {},
        opts: {
          removeOnComplete: true,
          removeOnFail: 50,
        },
      },
    );
  });
});
