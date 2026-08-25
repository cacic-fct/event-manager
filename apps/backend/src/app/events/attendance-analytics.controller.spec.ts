import { Permission } from '@cacic-fct/shared-permissions';
import { firstValueFrom, take } from 'rxjs';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { AttendanceAnalyticsController } from './attendance-analytics.controller';

describe('AttendanceAnalyticsController', () => {
  const analytics = { snapshot: jest.fn() };
  const replay = { scope: jest.fn(), replay: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    replay.scope.mockReturnValue('analytics-scope');
    replay.replay.mockImplementation((_scope, _cursor, source) => source);
  });

  it('requires attendance read permission for the analytics stream', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, AttendanceAnalyticsController.prototype.streamAnalytics),
    ).toEqual([Permission.EventAttendance.Read]);
  });

  it('emits an immediate snapshot with replay scope bound to event, window, and user', async () => {
    const snapshot = { eventId: 'event-1', total: 12 };
    analytics.snapshot.mockResolvedValue(snapshot);

    await expect(
      firstValueFrom(
        controller()
          .streamAnalytics('event-1', 30, undefined, undefined, 'cursor-4', {
            user: { sub: 'admin-1' },
            headers: { cookie: 'session=secret' },
          } as never)
          .pipe(take(1)),
      ),
    ).resolves.toEqual({ data: { type: 'event-attendance-analytics', snapshot } });

    expect(analytics.snapshot).toHaveBeenCalledWith('event-1', {
      windowMinutes: 30,
    });
    expect(replay.scope).toHaveBeenCalledWith('event-attendance-analytics', 'event-1:30', 'admin-1');
    expect(replay.replay).toHaveBeenCalledWith('analytics-scope', 'cursor-4', expect.anything());
  });

  it('uses the default window in the replay key and falls back to the session cookie identity', async () => {
    analytics.snapshot.mockResolvedValue({ eventId: 'event-1' });

    await firstValueFrom(
      controller()
        .streamAnalytics('event-1', undefined, undefined, undefined, undefined, {
          headers: { cookie: 'session=cookie-user' },
        } as never)
        .pipe(take(1)),
    );

    expect(replay.scope).toHaveBeenCalledWith('event-attendance-analytics', 'event-1:all', 'session=cookie-user');
  });

  it('binds a fixed interval to both the snapshot and replay scope', async () => {
    analytics.snapshot.mockResolvedValue({ eventId: 'event-1' });
    const start = '2026-08-16T12:00:00.000Z';
    const end = '2026-08-16T13:00:00.000Z';

    await firstValueFrom(
      controller()
        .streamAnalytics('event-1', undefined, start, end, undefined, {
          user: { sub: 'admin-1' },
          headers: {},
        } as never)
        .pipe(take(1)),
    );

    expect(analytics.snapshot).toHaveBeenCalledWith('event-1', {
      windowMinutes: undefined,
      start: new Date(start),
      end: new Date(end),
    });
    expect(replay.scope).toHaveBeenCalledWith('event-attendance-analytics', `event-1:${start}:${end}`, 'admin-1');
  });

  it('propagates snapshot failures through the SSE observable', async () => {
    analytics.snapshot.mockRejectedValueOnce(new Error('Analytics unavailable.'));

    await expect(
      firstValueFrom(
        controller()
          .streamAnalytics('event-1', 60, undefined, undefined, undefined, { headers: {} } as never)
          .pipe(take(1)),
      ),
    ).rejects.toThrow('Analytics unavailable.');
  });

  function controller(): AttendanceAnalyticsController {
    return new AttendanceAnalyticsController(analytics as never, replay as never);
  }
});
