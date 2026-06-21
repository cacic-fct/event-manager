import { CurrentUserEventSubscriptionsResolver } from './subscriptions.resolver';

describe('CurrentUserEventSubscriptionsResolver', () => {
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
          deletedAt: null,
          publiclyVisible: true,
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
          majorEventId: 'major-1',
          deletedAt: null,
          publiclyVisible: true,
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
