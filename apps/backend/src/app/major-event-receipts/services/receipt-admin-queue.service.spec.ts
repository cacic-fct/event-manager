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
    mapper.mapAdminQueueItem.mockReturnValue(mappedItem);
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
      subscriptionCount: 1,
      ticketCount: 0,
      availablePaymentTiers: [],
      items: [mappedItem],
    });

    expect(prisma.majorEventSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          majorEventId: 'major-1',
        }),
      }),
    );
    expect(mapper.mapAdminQueueItem).toHaveBeenCalledWith({ id: 'subscription-1' });
  });

  it('sorts combined receipts by edit time and returns full category and tier counts', async () => {
    const now = new Date();
    const subscription = { subscriptionId: 'subscription', category: 'SUBSCRIPTION', subscriptionUpdatedAt: now };
    const ticket = { subscriptionId: 'purchase', category: 'TICKET', subscriptionUpdatedAt: new Date(now.getTime() - 60_000) };
    const scopedPrisma = {
      majorEventSubscription: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([{}]) },
      ticketPurchase: { count: jest.fn().mockResolvedValue(1) },
      priceTier: { findMany: jest.fn().mockResolvedValue([{ id: 'tier-with-no-receipts', name: 'Completo' }]) },
    };
    const scopedMapper = { adminQueueSubscriptionSelect: jest.fn().mockReturnValue({}), mapAdminQueueItem: jest.fn().mockReturnValue(subscription) };
    const purchases = { pending: jest.fn().mockResolvedValue([ticket]), pendingWhere: jest.fn().mockReturnValue({ status: 'UNDER_REVIEW' }) };
    const merged = new ReceiptAdminQueueService(scopedPrisma as never, scopedMapper as never, notifications as never, purchases as never);
    await expect(merged.listPendingValidationQueue('major')).resolves.toEqual({
      pendingCount: 2, subscriptionCount: 1, ticketCount: 1,
      availablePaymentTiers: [{ id: 'tier-with-no-receipts', name: 'Completo' }], items: [ticket, subscription],
    });
    expect(purchases.pending).toHaveBeenCalledWith('major', 100);
    expect(scopedPrisma.majorEventSubscription.findMany.mock.calls[0][0]).toHaveProperty('take', 100);
  });

  it('bounds the merged response while reporting the full backlog', async () => {
    const now = new Date();
    const subscriptions = Array.from({ length: 100 }, (_, index) => ({ subscriptionId: `subscription-${index}`, subscriptionUpdatedAt: now }));
    prisma.majorEventSubscription.count.mockResolvedValue(500);
    prisma.majorEventSubscription.findMany.mockResolvedValue(subscriptions);
    mapper.mapAdminQueueItem.mockImplementation((item) => item);
    const ticket = { subscriptionId: 'purchase', subscriptionUpdatedAt: new Date(now.getTime() - 1_000) };
    const purchases = { pending: jest.fn().mockResolvedValue([ticket]), pendingWhere: jest.fn().mockReturnValue({}) };
    const scopedPrisma = { ...prisma, ticketPurchase: { count: jest.fn().mockResolvedValue(300) } };
    const merged = new ReceiptAdminQueueService(scopedPrisma as never, mapper as never, notifications as never, purchases as never);
    const result = await merged.listPendingValidationQueue();
    expect(result.items).toHaveLength(100);
    expect(result.items[0]).toBe(ticket);
    expect(result).toMatchObject({ pendingCount: 800, subscriptionCount: 500, ticketCount: 300 });
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
