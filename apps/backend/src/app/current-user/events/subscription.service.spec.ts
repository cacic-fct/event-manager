import { NotFoundException } from '@nestjs/common';
import { AuditLogEntityType } from '@prisma/client';
import { CurrentUserEventSubscriptionService } from './subscription.service';
import { PUBLIC_EVENT_WHERE } from '../../public-events/models';

describe('CurrentUserEventSubscriptionService', () => {
  it('records group subscriptions with their own audit entity type', async () => {
    const subscription = {
      id: 'group-subscription-1',
      eventGroupId: 'group-1',
      createdAt: new Date('2026-06-21T12:00:00.000Z'),
      eventGroup: {},
    };
    const event = {
      id: 'event-1',
      eventGroupId: 'group-1',
      majorEventId: null,
      allowSubscription: true,
      subscriptionStartDate: null,
      subscriptionEndDate: null,
      startDate: new Date('2099-01-01T12:00:00.000Z'),
      slots: null,
    };
    const tx = {
      event: { findMany: jest.fn().mockResolvedValue([event]) },
      eventGroupSubscription: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(subscription),
      },
      eventSubscription: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ eventId: 'event-1', eventGroupSubscriptionId: null }])
          .mockResolvedValueOnce([]),
        updateMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const mapper = {
      mapCurrentUserEventGroupSubscription: jest.fn().mockReturnValue({ id: subscription.id }),
    };
    const auditLog = {
      record: jest.fn(),
    };
    const service = new CurrentUserEventSubscriptionService(
      prisma as never,
      mapper as never,
      {} as never,
      { refresh: jest.fn() } as never,
      auditLog as never,
    );

    await service.subscribeCurrentUserEventGroup('person-1', 'group-1');

    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.EVENT_GROUP_SUBSCRIPTION,
        entityId: subscription.id,
      }),
      tx,
    );
  });

  it('requires standalone event subscriptions to target publicly visible events', async () => {
    const tx = {
      event: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const service = new CurrentUserEventSubscriptionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.subscribeCurrentUserEvent('person-1', 'hidden-event')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(tx.event.findFirst).toHaveBeenCalledWith({
      where: {
        AND: [PUBLIC_EVENT_WHERE, { id: 'hidden-event' }],
      },
      select: expect.any(Object),
    });
  });

  it('requires standalone event unsubscriptions to target existing non-deleted events', async () => {
    const tx = {
      event: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const service = new CurrentUserEventSubscriptionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.unsubscribeCurrentUserEvent('person-1', 'hidden-event')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(tx.event.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'hidden-event',
        deletedAt: null,
      },
      select: expect.any(Object),
    });
  });

  it('archives event form responses when a user unsubscribes from a standalone event', async () => {
    const event = {
      id: 'event-1',
      eventGroupId: null,
      majorEventId: null,
      allowSubscription: true,
      subscriptionStartDate: null,
      subscriptionEndDate: null,
      startDate: new Date('2099-01-01T12:00:00.000Z'),
      slots: null,
    };
    const subscription = {
      id: 'subscription-1',
      eventId: 'event-1',
      personId: 'person-1',
      eventGroupSubscriptionId: null,
      createdAt: new Date('2026-07-06T12:00:00.000Z'),
      createdById: null,
      createdByMethod: 'SELF_SUBSCRIPTION',
      deletedAt: null,
    };
    const tx = {
      event: {
        findFirst: jest.fn().mockResolvedValue(event),
      },
      eventSubscription: {
        findFirst: jest.fn().mockResolvedValue(subscription),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const mapper = {
      mapPublicEvent: jest.fn().mockReturnValue({ id: 'event-1' }),
    };
    const counters = {
      refresh: jest.fn(),
    };
    const auditLog = {
      record: jest.fn(),
    };
    const eventForms = {
      submitSubscriptionFlowResponses: jest.fn(),
      archiveResponsesForSubscriptionScope: jest.fn().mockResolvedValue(['form-1']),
      emitResultsDeltas: jest.fn(),
    };
    const service = new CurrentUserEventSubscriptionService(
      prisma as never,
      mapper as never,
      {} as never,
      counters as never,
      auditLog as never,
      eventForms as never,
    );

    await expect(service.unsubscribeCurrentUserEvent('person-1', 'event-1')).resolves.toEqual({ id: 'event-1' });

    expect(eventForms.archiveResponsesForSubscriptionScope).toHaveBeenCalledWith(
      tx,
      'person-1',
      {
        majorEventId: null,
        selectedEventIds: new Set(['event-1']),
      },
      expect.any(Date),
    );
    expect(eventForms.emitResultsDeltas).toHaveBeenCalledWith(['form-1']);
  });

  it('loads subscribed group events through active events', async () => {
    const prisma = {
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new CurrentUserEventSubscriptionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.getSubscribedEventsByEventGroupSubscription('person-1', ['subscription-1']),
    ).resolves.toEqual(new Map());

    expect(prisma.eventSubscription.findMany).toHaveBeenCalledWith({
      where: {
        personId: 'person-1',
        deletedAt: null,
        eventGroupSubscriptionId: {
          in: ['subscription-1'],
        },
        event: {
          deletedAt: null,
        },
      },
      select: expect.any(Object),
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });
  });

  it('subscribes to event groups using publicly visible child events while preserving active child subscriptions', async () => {
    const tx = {
      event: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      eventGroup: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      eventGroupSubscription: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const service = new CurrentUserEventSubscriptionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.subscribeCurrentUserEventGroup('person-1', 'group-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(tx.event.findMany).toHaveBeenCalledWith({
      where: {
        AND: [PUBLIC_EVENT_WHERE, { eventGroupId: 'group-1' }],
      },
      select: expect.any(Object),
      orderBy: {
        startDate: 'asc',
      },
    });
    expect(tx.eventSubscription.findMany).toHaveBeenCalledWith({
      where: {
        personId: 'person-1',
        deletedAt: null,
        event: {
          deletedAt: null,
          eventGroupId: 'group-1',
          majorEventId: null,
        },
      },
      select: expect.any(Object),
    });
  });

  it('enforces subscription-flow forms for every event subscribed through an event group', async () => {
    const groupSubscription = {
      id: 'group-subscription-1',
      eventGroupId: 'group-1',
      createdAt: new Date('2026-07-06T12:00:00.000Z'),
      eventGroup: {},
    };
    const events = [
      {
        id: 'event-1',
        eventGroupId: 'group-1',
        majorEventId: null,
        allowSubscription: true,
        subscriptionStartDate: null,
        subscriptionEndDate: null,
        startDate: new Date('2099-01-01T12:00:00.000Z'),
        slots: null,
      },
      {
        id: 'event-2',
        eventGroupId: 'group-1',
        majorEventId: null,
        allowSubscription: true,
        subscriptionStartDate: null,
        subscriptionEndDate: null,
        startDate: new Date('2099-01-02T12:00:00.000Z'),
        slots: null,
      },
    ];
    const tx = {
      event: {
        findFirst: jest.fn().mockResolvedValue(events[0]),
        findMany: jest.fn().mockResolvedValue(events),
      },
      eventGroupSubscription: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(groupSubscription),
      },
      eventSubscription: {
        findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(events.map((event) => ({ event }))),
        updateMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const mapper = {
      mapPublicEvent: jest.fn().mockReturnValue({ id: 'event-1' }),
    };
    const eventForms = {
      submitSubscriptionFlowResponses: jest.fn().mockResolvedValue([]),
      archiveResponsesForSubscriptionScope: jest.fn(),
      emitResultsDeltas: jest.fn(),
    };
    const service = new CurrentUserEventSubscriptionService(
      prisma as never,
      mapper as never,
      { refreshForEventPersons: jest.fn() } as never,
      { refresh: jest.fn() } as never,
      { record: jest.fn() } as never,
      eventForms as never,
    );

    await service.subscribeCurrentUserEvent('person-1', 'event-1', undefined, []);

    expect(eventForms.submitSubscriptionFlowResponses).toHaveBeenCalledWith(
      tx,
      'person-1',
      [],
      {
        majorEventId: null,
        selectedEventIds: new Set(['event-1', 'event-2']),
      },
      undefined,
    );
  });

});
