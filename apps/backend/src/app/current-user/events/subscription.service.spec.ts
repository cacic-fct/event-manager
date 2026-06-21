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
});
