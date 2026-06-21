import { NotFoundException } from '@nestjs/common';
import { CurrentUserEventSubscriptionService } from './subscription.service';

describe('CurrentUserEventSubscriptionService', () => {
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
        id: 'hidden-event',
        deletedAt: null,
        publiclyVisible: true,
      },
      select: expect.any(Object),
    });
  });

  it('requires standalone event unsubscriptions to target publicly visible events', async () => {
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
        publiclyVisible: true,
      },
      select: expect.any(Object),
    });
  });

  it('loads subscribed group events only through publicly visible events', async () => {
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
  });

  it('subscribes to event groups using only publicly visible child events', async () => {
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
        eventGroupId: 'group-1',
        deletedAt: null,
        publiclyVisible: true,
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
          eventGroupId: 'group-1',
          deletedAt: null,
          publiclyVisible: true,
          majorEventId: null,
        },
      },
      select: expect.any(Object),
    });
  });
});
