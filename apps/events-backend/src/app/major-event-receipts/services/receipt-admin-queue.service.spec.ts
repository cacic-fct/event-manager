import { SubscriptionStatus } from '@prisma/client';
import { ReceiptAdminQueueService } from './receipt-admin-queue.service';

describe('ReceiptAdminQueueService', () => {
  const mappedItem = { subscriptionId: 'subscription-1' };
  const prisma = {
    majorEventSubscription: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const mapper = {
    adminQueueSubscriptionSelect: jest.fn().mockReturnValue({ id: true }),
    mapAdminQueueItem: jest.fn().mockReturnValue(mappedItem),
  };
  const notifications = {
    notifyMajorEventSubscriptionRecordChanged: jest.fn(),
  };
  let service: ReceiptAdminQueueService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReceiptAdminQueueService(prisma as never, mapper as never, notifications as never);
  });

  it('counts pending paid major-event subscriptions', async () => {
    prisma.majorEventSubscription.count.mockResolvedValue(3);

    await expect(service.getPendingValidationCount()).resolves.toEqual({ pendingCount: 3 });

    expect(prisma.majorEventSubscription.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        subscriptionStatus: SubscriptionStatus.RECEIPT_UNDER_REVIEW,
        majorEvent: {
          deletedAt: null,
          isPaymentRequired: true,
        },
      }),
    });
  });

  it('lists the pending validation queue with optional major-event filtering', async () => {
    prisma.majorEventSubscription.count.mockResolvedValue(1);
    prisma.majorEventSubscription.findMany.mockResolvedValue([{ id: 'subscription-1' }]);

    await expect(service.listPendingValidationQueue('major-1')).resolves.toEqual({
      pendingCount: 1,
      items: [mappedItem],
    });

    expect(prisma.majorEventSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          majorEventId: 'major-1',
        }),
        take: 100,
      }),
    );
    expect(mapper.mapAdminQueueItem).toHaveBeenCalledWith({ id: 'subscription-1' });
  });

  it('returns a mapped queue item for a subscription', async () => {
    prisma.majorEventSubscription.findUnique.mockResolvedValue({ id: 'subscription-1' });

    await expect(service.getSubscriptionQueueItem('subscription-1')).resolves.toBe(mappedItem);
  });

  it('notifies when a notification record exists', async () => {
    const record = { id: 'subscription-1' };
    prisma.majorEventSubscription.findUnique.mockResolvedValue(record);

    await service.notifySubscriptionChanged(SubscriptionStatus.CONFIRMED, 'subscription-1');

    expect(notifications.notifyMajorEventSubscriptionRecordChanged).toHaveBeenCalledWith(
      SubscriptionStatus.CONFIRMED,
      record,
    );
  });

  it('skips notification when the record no longer exists', async () => {
    prisma.majorEventSubscription.findUnique.mockResolvedValue(null);

    await service.notifySubscriptionChanged(SubscriptionStatus.CONFIRMED, 'subscription-1');

    expect(notifications.notifyMajorEventSubscriptionRecordChanged).not.toHaveBeenCalled();
  });
});
