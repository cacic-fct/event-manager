import { CalendarFeedMaintenanceProcessor } from './calendar-feed-maintenance.processor';
import { DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB } from './calendar.models';
const { jest } = import.meta;

describe('CalendarFeedMaintenanceProcessor', () => {
  it('runs admin calendar feed maintenance for the scheduled job', async () => {
    const calendars = {
      runAdminCalendarFeedMaintenance: jest.fn().mockResolvedValue(2),
    };
    const metrics = { recordOperation: jest.fn() };
    const processor = new CalendarFeedMaintenanceProcessor(calendars as never, metrics as never);

    await processor.process({ name: DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB } as never);

    expect(calendars.runAdminCalendarFeedMaintenance).toHaveBeenCalledTimes(1);
    expect(metrics.recordOperation).toHaveBeenCalledWith('calendar_feed_maintenance_completed');
  });

  it('records failure and preserves the original failure for BullMQ', async () => {
    const failure = new Error('database unavailable');
    const calendars = { runAdminCalendarFeedMaintenance: jest.fn().mockRejectedValue(failure) };
    const metrics = { recordOperation: jest.fn() };
    const processor = new CalendarFeedMaintenanceProcessor(calendars as never, metrics as never);

    await expect(processor.process({ name: DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB } as never)).rejects.toBe(failure);
    expect(metrics.recordOperation).toHaveBeenCalledWith('calendar_feed_maintenance_failed');
  });

  it('rejects unrelated jobs on the same queue', async () => {
    const calendars = {
      runAdminCalendarFeedMaintenance: jest.fn(),
    };
    const metrics = { recordOperation: jest.fn() };
    const processor = new CalendarFeedMaintenanceProcessor(calendars as never, metrics as never);

    await expect(processor.process({ name: 'unknown-job' } as never)).rejects.toThrow(
      'Unsupported calendar feed maintenance job',
    );

    expect(calendars.runAdminCalendarFeedMaintenance).not.toHaveBeenCalled();
    expect(metrics.recordOperation).not.toHaveBeenCalled();
  });
});
