import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MajorEventSubscriptionFlow, ReceiptValidationActionType, SubscriptionStatus } from '@prisma/client';
import { ReceiptValidationService } from './receipt-validation.service';

describe('ReceiptValidationService', () => {
  const user = { sub: 'admin-1', token: 'token', permissionSet: new Set<string>() } as never;
  const prisma = {
    $transaction: jest.fn(),
  };
  const attendanceCategories = {
    refreshForMajorEventPerson: jest.fn(),
  };
  const majorEventSubscriptions = {
    allocateRankedEventIds: jest.fn(),
  };
  const dashboardInsights = {
    invalidateCachedInsights: jest.fn(),
  };
  const queue = {
    getSubscriptionQueueItem: jest.fn(),
    notifySubscriptionChanged: jest.fn(),
  };
  const sync = {
    syncConfirmedEventSubscriptions: jest.fn(),
    refreshEventSubscriptionCounters: jest.fn(),
  };
  let tx: ReturnType<typeof createTx>;
  let service: ReceiptValidationService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = createTx();
    prisma.$transaction.mockImplementation((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
    queue.getSubscriptionQueueItem.mockResolvedValue({ subscriptionId: 'subscription-1' });
    majorEventSubscriptions.allocateRankedEventIds.mockReturnValue(['event-1']);
    service = new ReceiptValidationService(
      prisma as never,
      attendanceCategories as never,
      majorEventSubscriptions as never,
      dashboardInsights as never,
      queue as never,
      sync as never,
    );
  });

  it('approves a direct-selection receipt and syncs confirmed event subscriptions', async () => {
    await expect(service.approveReceipt('subscription-1', 'receipt-1', undefined, user)).resolves.toEqual({
      actionId: 'action-1',
      item: { subscriptionId: 'subscription-1' },
    });

    expect(tx.majorEventReceiptValidationAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: ReceiptValidationActionType.APPROVE,
          nextStatus: SubscriptionStatus.CONFIRMED,
          createdById: 'admin-1',
        }),
      }),
    );
    expect(sync.syncConfirmedEventSubscriptions).toHaveBeenCalledWith(
      tx,
      'major-1',
      'person-1',
      ['event-1'],
      SubscriptionStatus.CONFIRMED,
      'admin-1',
    );
    expect(queue.notifySubscriptionChanged).toHaveBeenCalledWith(
      SubscriptionStatus.RECEIPT_UNDER_REVIEW,
      'subscription-1',
    );
    expect(dashboardInsights.invalidateCachedInsights).toHaveBeenCalled();
  });

  it('rejects invalid receipts only when a reason is provided', async () => {
    await expect(service.rejectReceipt('subscription-1', 'receipt-1', 'INVALID_RECEIPT', undefined, user)).rejects.toThrow(
      BadRequestException,
    );

    await expect(service.rejectReceipt('subscription-1', 'receipt-1', 'INVALID_RECEIPT', ' unreadable ', user)).resolves.toEqual({
      actionId: 'action-1',
      item: { subscriptionId: 'subscription-1' },
    });

    expect(tx.majorEventReceiptValidationAction.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: ReceiptValidationActionType.REJECT,
          nextStatus: SubscriptionStatus.REJECTED_INVALID_RECEIPT,
          nextRejectionReason: 'unreadable',
        }),
      }),
    );
  });

  it('undoes a validation action and restores the previous status', async () => {
    tx.majorEventReceiptValidationAction.findUnique.mockResolvedValue({
      id: 'action-1',
      subscriptionId: 'subscription-1',
      receiptId: 'receipt-1',
      previousStatus: SubscriptionStatus.RECEIPT_UNDER_REVIEW,
      nextStatus: SubscriptionStatus.CONFIRMED,
      previousRejectionReason: null,
      undoneAt: null,
      subscription: {
        majorEventId: 'major-1',
        personId: 'person-1',
        subscriptionStatus: SubscriptionStatus.CONFIRMED,
        selectedEvents: [{ eventId: 'event-1' }],
        receipts: [{ id: 'receipt-1' }],
      },
    });

    await expect(service.undoValidationAction('action-1', user)).resolves.toEqual({ subscriptionId: 'subscription-1' });

    expect(tx.majorEventSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionStatus: SubscriptionStatus.RECEIPT_UNDER_REVIEW,
          receiptValidatedAt: null,
          receiptValidatedBy: null,
        }),
      }),
    );
    expect(tx.majorEventReceiptValidationAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          undoneById: 'admin-1',
        }),
      }),
    );
    expect(queue.notifySubscriptionChanged).toHaveBeenCalledWith(SubscriptionStatus.CONFIRMED, 'subscription-1');
  });

  it('blocks approvals when the subscription is missing, already validated, or has a newer receipt', async () => {
    tx.majorEventSubscription.findUnique.mockResolvedValue(null);
    await expect(service.approveReceipt('subscription-1', 'receipt-1', undefined, user)).rejects.toThrow(NotFoundException);

    tx.majorEventSubscription.findUnique.mockResolvedValue({
      ...createSubscription(),
      subscriptionStatus: SubscriptionStatus.CONFIRMED,
    });
    await expect(service.approveReceipt('subscription-1', 'receipt-1', undefined, user)).rejects.toThrow(ConflictException);

    tx.majorEventSubscription.findUnique.mockResolvedValue({
      ...createSubscription(),
      receipts: [{ id: 'newer-receipt' }],
    });
    await expect(service.approveReceipt('subscription-1', 'receipt-1', undefined, user)).rejects.toThrow(ConflictException);
  });

  it('validates ranked selected event overrides', async () => {
    tx.majorEventSubscription.findUnique.mockResolvedValue({
      ...createSubscription(),
      subscriptionFlow: MajorEventSubscriptionFlow.RANKED_VOTING,
      selectedEvents: [
        createSelection('event-1', 'MINICURSO', true, 10),
        createSelection('event-2', 'PALESTRA', false, 10),
      ],
    });
    tx.eventSubscription.count.mockResolvedValue(0);
    majorEventSubscriptions.allocateRankedEventIds.mockReturnValue(['event-1']);

    await expect(service.approveReceipt('subscription-1', 'receipt-1', ['event-2'], user)).rejects.toThrow(BadRequestException);
    await expect(service.approveReceipt('subscription-1', 'receipt-1', ['event-1'], user)).resolves.toEqual({
      actionId: 'action-1',
      item: { subscriptionId: 'subscription-1' },
    });
  });

  it('blocks undo when the action is missing or the subscription changed', async () => {
    tx.majorEventReceiptValidationAction.findUnique.mockResolvedValue(null);
    await expect(service.undoValidationAction('action-1', user)).rejects.toThrow(NotFoundException);

    tx.majorEventReceiptValidationAction.findUnique.mockResolvedValue({
      id: 'action-1',
      subscriptionId: 'subscription-1',
      receiptId: 'receipt-1',
      previousStatus: SubscriptionStatus.RECEIPT_UNDER_REVIEW,
      nextStatus: SubscriptionStatus.CONFIRMED,
      previousRejectionReason: null,
      undoneAt: null,
      subscription: {
        majorEventId: 'major-1',
        personId: 'person-1',
        subscriptionStatus: SubscriptionStatus.CONFIRMED,
        selectedEvents: [],
        receipts: [{ id: 'newer-receipt' }],
      },
    });
    await expect(service.undoValidationAction('action-1', user)).rejects.toThrow(ConflictException);
  });
});

function createTx() {
  return {
    majorEventSubscription: {
      findUnique: jest.fn().mockResolvedValue(createSubscription()),
      update: jest.fn(),
    },
    majorEventReceiptValidationAction: {
      create: jest.fn().mockResolvedValue({ id: 'action-1' }),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    eventSubscription: {
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

function createSubscription() {
  return {
    id: 'subscription-1',
    majorEventId: 'major-1',
    personId: 'person-1',
    deletedAt: null,
    subscriptionStatus: SubscriptionStatus.RECEIPT_UNDER_REVIEW,
    receiptRejectionReason: null,
    subscriptionFlow: MajorEventSubscriptionFlow.REGULAR,
    desiredCourses: 1,
    desiredLectures: 0,
    desiredUncategorized: 0,
    selectedEvents: [createSelection('event-1', 'MINICURSO', false, 10)],
    receipts: [{ id: 'receipt-1' }],
  };
}

function createSelection(eventId: string, type: string, autoSubscribe: boolean, slots: number | null) {
  return {
    eventId,
    preferenceOrder: 1,
    event: {
      id: eventId,
      type,
      eventGroupId: null,
      startDate: new Date(`2026-01-01T${eventId === 'event-1' ? '10' : '12'}:00:00.000Z`),
      endDate: new Date(`2026-01-01T${eventId === 'event-1' ? '11' : '13'}:00:00.000Z`),
      slots,
      autoSubscribe,
    },
  };
}
