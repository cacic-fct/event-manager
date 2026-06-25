import { CurrentUserEventSubscriptionsResolver } from './subscriptions.resolver';
import { PUBLIC_EVENT_WHERE } from '../../public-events/models';

describe('CurrentUserEventSubscriptionsResolver', () => {
  const frozenResources = {
    assertEventMutable: jest.fn().mockResolvedValue(undefined),
    assertEventGroupMutable: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists standalone event subscriptions only through publicly visible events', async () => {
    const subscription = {
      event: {
        id: 'event-1',
      },
    };
    const prisma = {
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([subscription]),
      },
    };
    const currentUserContext = {
      getAuthenticatedUser: jest.fn().mockReturnValue({ sub: 'user-1' }),
      resolveCurrentUserContext: jest.fn().mockResolvedValue({ person: { id: 'person-1' } }),
    };
    const mapper = {
      mapPublicEvent: jest.fn().mockReturnValue({ id: 'event-1' }),
    };
    const resolver = new CurrentUserEventSubscriptionsResolver(
      prisma as never,
      currentUserContext as never,
      mapper as never,
      {} as never,
      frozenResources as never,
    );

    await expect(
      resolver.currentUserStandaloneEventSubscriptions({ req: { user: { sub: 'user-1' } } } as never),
    ).resolves.toEqual([{ id: 'event-1' }]);

    expect(prisma.eventSubscription.findMany).toHaveBeenCalledWith({
      where: {
        personId: 'person-1',
        deletedAt: null,
        event: {
          AND: [PUBLIC_EVENT_WHERE, { majorEventId: null }],
        },
      },
      select: expect.any(Object),
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });
    expect(mapper.mapPublicEvent).toHaveBeenCalledWith(subscription.event);
  });

  it('looks up a current-user event subscription only through publicly visible events', async () => {
    const prisma = {
      eventSubscription: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const currentUserContext = {
      getAuthenticatedUser: jest.fn().mockReturnValue({ sub: 'user-1' }),
      resolveCurrentUserContext: jest.fn().mockResolvedValue({ person: { id: 'person-1' } }),
    };
    const resolver = new CurrentUserEventSubscriptionsResolver(
      prisma as never,
      currentUserContext as never,
      {} as never,
      {} as never,
      frozenResources as never,
    );

    await expect(
      resolver.currentUserEventSubscription('hidden-event', { req: { user: { sub: 'user-1' } } } as never),
    ).resolves.toBeNull();

    expect(prisma.eventSubscription.findFirst).toHaveBeenCalledWith({
      where: {
        eventId: 'hidden-event',
        personId: 'person-1',
        deletedAt: null,
        event: {
          AND: [PUBLIC_EVENT_WHERE],
        },
      },
      select: expect.any(Object),
    });
  });

  it('lists current-user event subscriptions for a major event', async () => {
    const subscription = {
      eventId: 'event-1',
      eventGroupSubscriptionId: null,
      createdAt: new Date('2026-05-01T10:00:00.000Z'),
      event: {
        id: 'event-1',
      },
    };
    const prisma = {
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([subscription]),
      },
    };
    const currentUserContext = {
      getAuthenticatedUser: jest.fn().mockReturnValue({ sub: 'user-1' }),
      resolveCurrentUserContext: jest.fn().mockResolvedValue({ person: { id: 'person-1' } }),
    };
    const mapper = {
      mapCurrentUserEventSubscription: jest.fn().mockReturnValue({
        eventId: 'event-1',
        event: { id: 'event-1' },
        createdAt: subscription.createdAt,
      }),
    };
    const resolver = new CurrentUserEventSubscriptionsResolver(
      prisma as never,
      currentUserContext as never,
      mapper as never,
      {} as never,
      frozenResources as never,
    );

    await expect(
      resolver.currentUserMajorEventEventSubscriptions('major-1', { req: { user: { sub: 'user-1' } } } as never),
    ).resolves.toEqual([
      {
        eventId: 'event-1',
        event: { id: 'event-1' },
        createdAt: subscription.createdAt,
      },
    ]);

    expect(prisma.eventSubscription.findMany).toHaveBeenCalledWith({
      where: {
        personId: 'person-1',
        deletedAt: null,
        event: {
          AND: [PUBLIC_EVENT_WHERE, { majorEventId: 'major-1' }],
        },
      },
      select: expect.any(Object),
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });
    expect(mapper.mapCurrentUserEventSubscription).toHaveBeenCalledWith(subscription);
  });
});
