import type { Request } from 'express';
import { firstValueFrom, take } from 'rxjs';
import { AUTH_SESSION_COOKIE_NAME, IS_PUBLIC_KEY } from '../../auth/auth.constants';
import {
  CurrentUserOnlineAttendanceRealtimeService,
  CurrentUserRealtimeEventsController,
} from './attendance-realtime.service';

describe('CurrentUserOnlineAttendanceRealtimeService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('clears polling and heartbeat timers on module teardown', () => {
    const { service } = createService();
    const complete = jest.fn();

    const subscription = service.stream({ headers: {} } as Request, [], []).subscribe({ complete });

    expect(jest.getTimerCount()).toBeGreaterThanOrEqual(2);

    service.onModuleDestroy();

    expect(complete).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);

    subscription.unsubscribe();
  });

  it('lists pending online attendance events and maps public event records', async () => {
    const { mapper, prisma, service } = createService();
    const event = {
      id: 'event-1',
      name: 'Online event',
    };
    const mappedEvent = {
      id: 'event-1',
      name: 'Mapped online event',
    };
    prisma.event.findMany.mockResolvedValueOnce([event]);
    mapper.mapPublicEvent.mockReturnValueOnce(mappedEvent);

    await expect(service.listPendingOnlineAttendanceEvents('person-1')).resolves.toEqual([
      {
        eventId: 'event-1',
        event: mappedEvent,
      },
    ]);

    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          shouldCollectAttendance: true,
          isOnlineAttendanceAllowed: true,
          attendances: {
            none: {
              personId: 'person-1',
            },
          },
          OR: [
            {
              allowSubscription: false,
            },
            {
              subscriptions: {
                some: {
                  personId: 'person-1',
                  deletedAt: null,
                },
              },
            },
          ],
        }),
        orderBy: {
          startDate: 'asc',
        },
      }),
    );
    expect(mapper.mapPublicEvent).toHaveBeenCalledWith(event);
  });

  it('emits pending attendance after resolving the current user from an encoded session cookie', async () => {
    const { auth, currentUserContext, mapper, prisma, service } = createService();
    auth.authenticateSession.mockResolvedValueOnce({ sub: 'user-1' });
    currentUserContext.resolveCurrentUserContext.mockResolvedValueOnce({
      person: {
        id: 'person-1',
      },
    });
    prisma.event.findMany.mockResolvedValueOnce([{ id: 'event-1' }]);
    mapper.mapPublicEvent.mockReturnValueOnce({ id: 'event-1' });

    const stream = service.stream(
      {
        headers: {
          cookie: `other=value; ${AUTH_SESSION_COOKIE_NAME}=session%201`,
        },
      } as Request,
      [],
      [],
    );

    await expect(firstValueFrom(stream.pipe(take(1)))).resolves.toEqual({
      data: {
        type: 'event',
        channel: 'current-user.online-attendance',
        event: 'pendingOnlineAttendancesChanged',
        payload: {
          eventIds: ['event-1'],
        },
      },
    });
    expect(auth.authenticateSession).toHaveBeenCalledWith('session 1');
    expect(currentUserContext.resolveCurrentUserContext).toHaveBeenCalledWith({ sub: 'user-1' });

    service.onModuleDestroy();
  });

  it('uses parsed request cookies before the raw cookie header when resolving a stream person', async () => {
    const { auth, currentUserContext, service } = createService();
    auth.authenticateSession.mockResolvedValueOnce({ sub: 'user-1' });
    currentUserContext.resolveCurrentUserContext.mockResolvedValueOnce({
      person: null,
    });

    const subscription = service.stream(
      {
        cookies: {
          [AUTH_SESSION_COOKIE_NAME]: 'parsed-session',
        },
        headers: {
          cookie: `${AUTH_SESSION_COOKIE_NAME}=header-session`,
        },
      } as Request,
      [],
      [],
    ).subscribe();
    await flushPromises();

    expect(auth.authenticateSession).toHaveBeenCalledWith('parsed-session');

    subscription.unsubscribe();
    service.onModuleDestroy();
  });

  it('emits major-event and event subscription snapshots and suppresses unchanged repeats', async () => {
    const { publicEvents, service } = createService();
    publicEvents.getPublicEventSubscriptionPagePayload.mockResolvedValue({
      subscriptionSummaries: [
        {
          eventId: 'event-1',
          hasAvailableSlots: true,
        },
      ],
    });
    publicEvents.publicEventSubscriptionSummary.mockResolvedValue({
      eventId: 'event-1',
      hasAvailableSlots: true,
    });
    const events = collectMessages(service.stream({ headers: {} } as Request, ['major-1'], ['event-1']));

    await notifyMajorEventSubscribers(service, 'major-1');
    await notifyEventSubscriptionSubscribers(service, 'event-1');
    await notifyMajorEventSubscribers(service, 'major-1');
    await notifyEventSubscriptionSubscribers(service, 'event-1');

    expect(events.messages).toEqual([
      {
        data: {
          type: 'event',
          channel: 'public.major-event-subscription',
          event: 'majorEventSubscriptionChanged',
          majorEventId: 'major-1',
          payload: {
            subscriptionSummaries: [
              {
                eventId: 'event-1',
                hasAvailableSlots: true,
              },
            ],
          },
        },
      },
      {
        data: {
          type: 'event',
          channel: 'current-user.event-subscription',
          event: 'eventSubscriptionAvailabilityChanged',
          eventId: 'event-1',
          payload: {
            eventId: 'event-1',
            hasAvailableSlots: true,
          },
        },
      },
    ]);

    publicEvents.publicEventSubscriptionSummary.mockResolvedValueOnce({
      eventId: 'event-1',
      hasAvailableSlots: false,
    });
    await notifyEventSubscriptionSubscribers(service, 'event-1');

    expect(events.messages).toHaveLength(3);
    expect(events.messages[2]).toEqual({
      data: expect.objectContaining({
        event: 'eventSubscriptionAvailabilityChanged',
        payload: {
          eventId: 'event-1',
          hasAvailableSlots: false,
        },
      }),
    });

    events.subscription.unsubscribe();
    service.onModuleDestroy();
  });

  it('notifies each connected person once when broadcasting pending attendances', async () => {
    const { auth, currentUserContext, mapper, prisma, service } = createService();
    auth.authenticateSession.mockResolvedValue({ sub: 'user-1' });
    currentUserContext.resolveCurrentUserContext.mockResolvedValue({
      person: {
        id: 'person-1',
      },
    });
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1' }]);
    mapper.mapPublicEvent.mockReturnValue({ id: 'event-1' });

    const first = collectMessages(
      service.stream({ cookies: { [AUTH_SESSION_COOKIE_NAME]: 'session-1' }, headers: {} } as Request, [], []),
    );
    const second = collectMessages(
      service.stream({ cookies: { [AUTH_SESSION_COOKIE_NAME]: 'session-2' }, headers: {} } as Request, [], []),
    );
    await waitForMessages(first.messages, 2);
    await waitForMessages(second.messages, 2);
    first.messages.length = 0;
    second.messages.length = 0;
    prisma.event.findMany.mockClear();

    await service.notifyAllConnectedPeople();

    expect(prisma.event.findMany).toHaveBeenCalledTimes(1);
    expect(first.messages).toHaveLength(1);
    expect(second.messages).toHaveLength(1);

    first.subscription.unsubscribe();
    second.subscription.unsubscribe();
    service.onModuleDestroy();
  });
});

describe('CurrentUserRealtimeEventsController', () => {
  it('allows guests to receive public subscription updates', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, CurrentUserRealtimeEventsController.prototype.stream)).toBe(true);
  });

  it('normalizes event ids and replays the authenticated session stream from Last-Event-ID', () => {
    const realtime = {
      stream: jest.fn().mockReturnValue('stream'),
    };
    const replay = {
      scope: jest.fn().mockReturnValue('scope'),
      replay: jest.fn((_scope, _lastEventId, stream) => stream),
    };
    const controller = new CurrentUserRealtimeEventsController(realtime as never, replay as never);
    const request = {
      cookies: {
        [AUTH_SESSION_COOKIE_NAME]: 'session-1',
      },
      headers: {},
    } as Request;

    expect(
      controller.stream(request, [' major-1,major-2 ', 'major-1'], ' event-1,,event-2 ', 'sse1.cursor'),
    ).toBe('stream');
    expect(realtime.stream).toHaveBeenCalledWith(request, ['major-1', 'major-2'], ['event-1', 'event-2']);
    expect(replay.scope).toHaveBeenCalledWith(
      'current-user-events-realtime',
      'session-1',
      'major-1,major-2',
      'event-1,event-2',
    );
    expect(replay.replay).toHaveBeenCalledWith('scope', 'sse1.cursor', 'stream');
  });
});

function createService() {
  const dependencies = {
    auth: {
      authenticateSession: jest.fn(),
    },
    currentUserContext: {
      resolveCurrentUserContext: jest.fn(),
    },
    mapper: {
      mapPublicEvent: jest.fn(),
    },
    prisma: {
      event: {
        findMany: jest.fn(),
      },
    },
    publicEvents: {
      getPublicEventSubscriptionPagePayload: jest.fn(),
      publicEventSubscriptionSummary: jest.fn(),
    },
  };
  const service = new CurrentUserOnlineAttendanceRealtimeService(
    dependencies.auth as never,
    dependencies.currentUserContext as never,
    dependencies.mapper as never,
    dependencies.prisma as never,
    dependencies.publicEvents as never,
  );

  return {
    ...dependencies,
    service,
  };
}

function collectMessages(stream: ReturnType<CurrentUserOnlineAttendanceRealtimeService['stream']>) {
  const messages: unknown[] = [];
  const subscription = stream.subscribe((message) => messages.push(message));

  return {
    messages,
    subscription,
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForMessages(messages: unknown[], count: number): Promise<void> {
  for (let attempts = 0; attempts < 10 && messages.length < count; attempts += 1) {
    await flushPromises();
  }

  expect(messages).toHaveLength(count);
}

type RealtimeInternals = CurrentUserOnlineAttendanceRealtimeService & {
  notifyMajorEventSubscribers(majorEventId: string): Promise<void>;
  notifyEventSubscriptionSubscribers(eventId: string): Promise<void>;
};

async function notifyMajorEventSubscribers(
  service: CurrentUserOnlineAttendanceRealtimeService,
  majorEventId: string,
): Promise<void> {
  await (service as unknown as RealtimeInternals).notifyMajorEventSubscribers(majorEventId);
}

async function notifyEventSubscriptionSubscribers(
  service: CurrentUserOnlineAttendanceRealtimeService,
  eventId: string,
): Promise<void> {
  await (service as unknown as RealtimeInternals).notifyEventSubscriptionSubscribers(eventId);
}
