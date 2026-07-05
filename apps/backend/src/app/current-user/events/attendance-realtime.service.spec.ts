import type { Request } from 'express';
import { CurrentUserOnlineAttendanceRealtimeService } from './attendance-realtime.service';

describe('CurrentUserOnlineAttendanceRealtimeService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('clears polling and heartbeat timers on module teardown', () => {
    const service = createService();
    const complete = jest.fn();

    const subscription = service.stream({ headers: {} } as Request, [], []).subscribe({ complete });

    expect(jest.getTimerCount()).toBeGreaterThanOrEqual(2);

    service.onModuleDestroy();

    expect(complete).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);

    subscription.unsubscribe();
  });
});

function createService(): CurrentUserOnlineAttendanceRealtimeService {
  return new CurrentUserOnlineAttendanceRealtimeService(
    {
      authenticateSession: jest.fn(),
    } as never,
    {
      resolveCurrentUserContext: jest.fn(),
    } as never,
    {
      mapPublicEvent: jest.fn(),
    } as never,
    {
      event: {
        findMany: jest.fn(),
      },
    } as never,
    {
      getPublicEventSubscriptionPagePayload: jest.fn(),
      publicEventSubscriptionSummary: jest.fn(),
    } as never,
  );
}
