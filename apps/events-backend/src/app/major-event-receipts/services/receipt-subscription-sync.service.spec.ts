import { SubscriptionStatus } from '@prisma/client';
import { ReceiptSubscriptionSyncService } from './receipt-subscription-sync.service';

describe('ReceiptSubscriptionSyncService', () => {
  let service: ReceiptSubscriptionSyncService;

  beforeEach(() => {
    service = new ReceiptSubscriptionSyncService();
  });

  it('archives unselected active event subscriptions and creates missing confirmed ones', async () => {
    const tx = {
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([{ eventId: 'event-1' }, { eventId: 'event-2' }]),
        updateMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    await service.syncConfirmedEventSubscriptions(
      tx as never,
      'major-1',
      'person-1',
      ['event-2', 'event-3'],
      SubscriptionStatus.CONFIRMED,
      'admin-1',
    );

    expect(tx.eventSubscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: {
            in: ['event-1'],
          },
        }),
      }),
    );
    expect(tx.eventSubscription.createMany).toHaveBeenCalledWith({
      data: [
        {
          eventId: 'event-3',
          personId: 'person-1',
          createdById: 'admin-1',
          createdByMethod: 'ADMIN_DASHBOARD',
        },
      ],
    });
  });

  it('archives all active event subscriptions for non-confirmed statuses', async () => {
    const tx = {
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([{ eventId: 'event-1' }]),
        updateMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    await service.syncConfirmedEventSubscriptions(
      tx as never,
      'major-1',
      'person-1',
      ['event-1'],
      SubscriptionStatus.RECEIPT_UNDER_REVIEW,
      'admin-1',
    );

    expect(tx.eventSubscription.updateMany).toHaveBeenCalled();
    expect(tx.eventSubscription.createMany).not.toHaveBeenCalled();
  });

  it('does not refresh counters when there are no event ids', async () => {
    const tx = {
      $executeRaw: jest.fn(),
    };

    await service.refreshEventSubscriptionCounters(tx as never, []);

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('refreshes counters once per unique event id', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    await service.refreshEventSubscriptionCounters(tx as never, ['event-1', 'event-1', 'event-2']);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });
});
