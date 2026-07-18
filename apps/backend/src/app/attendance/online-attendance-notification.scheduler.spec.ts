import { OnlineAttendanceNotificationScheduler } from './online-attendance-notification.scheduler';

describe('OnlineAttendanceNotificationScheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reconciles pending notifications on startup and every minute', async () => {
    const jobs = { schedulePendingEvents: jest.fn().mockResolvedValue(undefined) };
    const scheduler = new OnlineAttendanceNotificationScheduler(jobs as never);

    scheduler.onModuleInit();
    await Promise.resolve();
    expect(jobs.schedulePendingEvents).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(60_000);
    expect(jobs.schedulePendingEvents).toHaveBeenCalledTimes(2);

    scheduler.onModuleDestroy();
  });

  it('does not overlap reconciliation runs', async () => {
    let resolvePending: (() => void) | undefined;
    const jobs = {
      schedulePendingEvents: jest.fn(
        () =>
          new Promise<void>((resolve) => {
            resolvePending = resolve;
          }),
      ),
    };
    const scheduler = new OnlineAttendanceNotificationScheduler(jobs as never);

    scheduler.onModuleInit();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(jobs.schedulePendingEvents).toHaveBeenCalledTimes(1);

    resolvePending?.();
    await Promise.resolve();
    scheduler.onModuleDestroy();
  });
});
