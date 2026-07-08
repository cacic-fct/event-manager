import { NotFoundException } from '@nestjs/common';
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

  it('passes standalone subscription form responses into the subscription transaction', async () => {
    const formResponses = [
      {
        formId: 'form-1',
        linkId: 'link-1',
        targetType: 'EVENT' as const,
        eventId: 'event-1',
        answersJson: JSON.stringify([{ elementId: 'shirt-size', value: 'M' }]),
      },
    ];
    const currentUserContext = {
      getAuthenticatedUser: jest.fn().mockReturnValue({ sub: 'user-1' }),
      requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'person-1' }),
    };
    const eventSubscriptions = {
      subscribeCurrentUserEvent: jest.fn().mockResolvedValue({ id: 'event-1' }),
    };
    const resolver = new CurrentUserEventSubscriptionsResolver(
      {} as never,
      currentUserContext as never,
      {} as never,
      eventSubscriptions as never,
      frozenResources as never,
    );

    await expect(
      resolver.subscribeCurrentUserStandaloneEvent(
        'event-1',
        formResponses,
        { req: { user: { sub: 'user-1' } } } as never,
      ),
    ).resolves.toEqual({ id: 'event-1' });

    expect(eventSubscriptions.subscribeCurrentUserEvent).toHaveBeenCalledWith(
      'person-1',
      'event-1',
      { sub: 'user-1' },
      formResponses,
    );
  });

  it('returns empty group and merged subscription lists when the current user has no person', async () => {
    const { currentUserContext, eventSubscriptions, prisma, resolver } = createResolver();
    currentUserContext.resolveCurrentUserContext.mockResolvedValue({ person: null });

    await expect(resolver.currentUserEventGroupSubscriptions(context())).resolves.toEqual([]);
    await expect(resolver.currentUserSubscribedItems(context())).resolves.toEqual([]);
    await expect(resolver.currentUserEventGroupSubscription('group-1', context())).resolves.toBeNull();

    expect(prisma.eventGroupSubscription.findMany).not.toHaveBeenCalled();
    expect(eventSubscriptions.getCurrentUserSubscribedItems).not.toHaveBeenCalled();
  });

  it('maps current-user event and group subscriptions when records exist', async () => {
    const { currentUserContext, eventSubscriptions, mapper, prisma, resolver } = createResolver();
    const createdAt = new Date('2026-06-01T10:00:00.000Z');
    const eventSubscription = {
      eventId: 'event-1',
      createdAt,
    };
    const groupSubscription = {
      id: 'group-subscription-1',
      eventGroupId: 'group-1',
      createdAt,
    };
    const groupEvents = [{ id: 'event-1' }];
    currentUserContext.resolveCurrentUserContext.mockResolvedValue({ person: { id: 'person-1' } });
    prisma.eventSubscription.findFirst.mockResolvedValue(eventSubscription);
    prisma.eventGroupSubscription.findMany.mockResolvedValue([groupSubscription]);
    prisma.eventGroupSubscription.findFirst.mockResolvedValue(groupSubscription);
    eventSubscriptions.getSubscribedEventsByEventGroupSubscription.mockResolvedValue(
      new Map([[groupSubscription.id, groupEvents]]),
    );
    mapper.mapCurrentUserEventSubscription.mockReturnValue({ eventId: 'event-1', createdAt });
    mapper.mapCurrentUserEventGroupSubscription.mockReturnValue({ eventGroupId: 'group-1', createdAt });

    await expect(resolver.currentUserEventSubscription('event-1', context())).resolves.toEqual({
      eventId: 'event-1',
      createdAt,
    });
    await expect(resolver.currentUserEventGroupSubscriptions(context())).resolves.toEqual([
      {
        eventGroupId: 'group-1',
        createdAt,
      },
    ]);
    await expect(resolver.currentUserEventGroupSubscription('group-1', context())).resolves.toEqual({
      eventGroupId: 'group-1',
      createdAt,
    });

    expect(mapper.mapCurrentUserEventSubscription).toHaveBeenCalledWith(eventSubscription);
    expect(eventSubscriptions.getSubscribedEventsByEventGroupSubscription).toHaveBeenCalledWith('person-1', [
      'group-subscription-1',
    ]);
    expect(mapper.mapCurrentUserEventGroupSubscription).toHaveBeenCalledWith(groupSubscription, groupEvents);
  });

  it('maps merged subscribed single-event and event-group items', async () => {
    const { currentUserContext, eventSubscriptions, mapper, resolver } = createResolver();
    const startDate = new Date('2026-06-01T10:00:00.000Z');
    const singleItem = {
      type: 'single' as const,
      id: 'event-subscription-1',
      event: { id: 'event-1' },
      startDate,
    };
    const groupItem = {
      type: 'group' as const,
      id: 'group-subscription-1',
      eventGroup: { id: 'group-1' },
      events: [{ id: 'event-2' }],
      startDate,
    };
    currentUserContext.resolveCurrentUserContext.mockResolvedValue({ person: { id: 'person-1' } });
    eventSubscriptions.getCurrentUserSubscribedItems.mockResolvedValue([singleItem, groupItem]);
    mapper.mapSubscribedSingleEventItem.mockReturnValue({ event: { id: 'event-1' } });
    mapper.mapPublicEventGroup.mockReturnValue({ id: 'group-1', name: 'Grupo' });
    mapper.mapSubscribedEventGroupItem.mockReturnValue({ eventGroup: { id: 'group-1' } });

    await expect(resolver.currentUserSubscribedItems(context())).resolves.toEqual([
      { event: { id: 'event-1' } },
      { eventGroup: { id: 'group-1' } },
    ]);

    expect(mapper.mapSubscribedSingleEventItem).toHaveBeenCalledWith(
      'event-subscription-1',
      singleItem.event,
      startDate,
    );
    expect(mapper.mapPublicEventGroup).toHaveBeenCalledWith(groupItem.eventGroup);
    expect(mapper.mapSubscribedEventGroupItem).toHaveBeenCalledWith(
      'group-subscription-1',
      { id: 'group-1', name: 'Grupo' },
      groupItem.events,
      startDate,
    );
  });

  it('guards unsubscribe and event-group subscribe mutations with frozen-resource checks', async () => {
    const { currentUserContext, eventSubscriptions, frozenResources: frozen, resolver } = createResolver();
    currentUserContext.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    eventSubscriptions.unsubscribeCurrentUserEvent.mockResolvedValue({ id: 'event-1' });
    eventSubscriptions.subscribeCurrentUserEventGroup.mockResolvedValue({ eventGroupId: 'group-1' });

    await expect(resolver.unsubscribeCurrentUserStandaloneEvent('event-1', context())).resolves.toEqual({
      id: 'event-1',
    });
    await expect(resolver.subscribeCurrentUserEventGroup('group-1', context())).resolves.toEqual({
      eventGroupId: 'group-1',
    });

    expect(frozen.assertEventMutable).toHaveBeenCalledWith('event-1', { sub: 'user-1' }, 'delete');
    expect(eventSubscriptions.unsubscribeCurrentUserEvent).toHaveBeenCalledWith(
      'person-1',
      'event-1',
      { sub: 'user-1' },
    );
    expect(frozen.assertEventGroupMutable).toHaveBeenCalledWith('group-1', { sub: 'user-1' }, 'edit');
    expect(eventSubscriptions.subscribeCurrentUserEventGroup).toHaveBeenCalledWith(
      'person-1',
      'group-1',
      { sub: 'user-1' },
    );
  });

  it('throws for missing major events and filters subscribable events when requested', async () => {
    const { prisma, resolver } = createResolver();
    prisma.majorEvent.findFirst.mockResolvedValueOnce(null);

    await expect(resolver.eventsByMajorEventId('missing-major', true, context())).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.majorEvent.findFirst.mockResolvedValueOnce({ id: 'major-1' });
    prisma.event.findMany.mockResolvedValueOnce([{ id: 'event-1' }]);

    await expect(resolver.eventsByMajorEventId('major-1', true, context())).resolves.toEqual([{ id: 'event-1' }]);

    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: {
        AND: [PUBLIC_EVENT_WHERE, { majorEventId: 'major-1' }],
        allowSubscription: true,
      },
      select: expect.any(Object),
      orderBy: {
        startDate: 'asc',
      },
    });
  });
});

function context() {
  return { req: { user: { sub: 'user-1' } } } as never;
}

function createResolver() {
  const prisma = {
    event: {
      findMany: jest.fn(),
    },
    eventSubscription: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    eventGroupSubscription: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    majorEvent: {
      findFirst: jest.fn(),
    },
  };
  const currentUserContext = {
    getAuthenticatedUser: jest.fn().mockReturnValue({ sub: 'user-1' }),
    requireCurrentPerson: jest.fn(),
    resolveCurrentUserContext: jest.fn(),
  };
  const mapper = {
    mapCurrentUserEventGroupSubscription: jest.fn(),
    mapCurrentUserEventSubscription: jest.fn(),
    mapPublicEvent: jest.fn(),
    mapPublicEventGroup: jest.fn(),
    mapSubscribedEventGroupItem: jest.fn(),
    mapSubscribedSingleEventItem: jest.fn(),
  };
  const eventSubscriptions = {
    getCurrentUserSubscribedItems: jest.fn(),
    getSubscribedEventsByEventGroupSubscription: jest.fn(),
    subscribeCurrentUserEventGroup: jest.fn(),
    subscribeCurrentUserEvent: jest.fn(),
    unsubscribeCurrentUserEvent: jest.fn(),
  };
  const localFrozenResources = {
    assertEventMutable: jest.fn().mockResolvedValue(undefined),
    assertEventGroupMutable: jest.fn().mockResolvedValue(undefined),
  };
  const resolver = new CurrentUserEventSubscriptionsResolver(
    prisma as never,
    currentUserContext as never,
    mapper as never,
    eventSubscriptions as never,
    localFrozenResources as never,
  );

  return {
    currentUserContext,
    eventSubscriptions,
    frozenResources: localFrozenResources,
    mapper,
    prisma,
    resolver,
  };
}
