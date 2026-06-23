import { CalendarFeedMaintenanceProcessor } from './calendar-feed-maintenance.processor';
import { DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB } from './calendar.models';

describe('CalendarFeedMaintenanceProcessor', () => {
  it('runs admin calendar feed maintenance for the scheduled job', async () => {
    const calendars = {
      runAdminCalendarFeedMaintenance: jest.fn().mockResolvedValue(2),
    };
    const processor = new CalendarFeedMaintenanceProcessor(calendars as never);

    await processor.process({ name: DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB } as never);

    expect(calendars.runAdminCalendarFeedMaintenance).toHaveBeenCalledTimes(1);
  });

  it('ignores unrelated jobs on the same queue', async () => {
    const calendars = {
      runAdminCalendarFeedMaintenance: jest.fn(),
    };
    const processor = new CalendarFeedMaintenanceProcessor(calendars as never);

    await processor.process({ name: 'unknown-job' } as never);

    expect(calendars.runAdminCalendarFeedMaintenance).not.toHaveBeenCalled();
  });
});
