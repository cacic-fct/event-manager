import { MajorEventSubscriptionFlow, SubscriptionStatus } from '@prisma/client';
import { mapReceipt, ReceiptQueueMapper } from './receipt-queue.mapper';

describe('ReceiptQueueMapper', () => {
  const allocator = {
    allocateRankedEventIds: jest.fn().mockReturnValue(['event-1']),
  };
  let mapper: ReceiptQueueMapper;

  beforeEach(() => {
    jest.clearAllMocks();
    mapper = new ReceiptQueueMapper(allocator as never);
  });

  it('maps the admin queue item and hides OCR fields until there is a match', () => {
    const item = mapper.mapAdminQueueItem(createSubscription({ amountMatched: false, nameMatched: false }));

    expect(item.subscriptionId).toBe('subscription-1');
    expect(item.receipt?.amountMatched).toBeNull();
    expect(item.events).toEqual([
      expect.objectContaining({
        id: 'event-1',
        selectedForConfirmation: true,
        hasScheduleConflict: true,
        hasNoSlots: false,
      }),
      expect.objectContaining({
        id: 'event-2',
        selectedForConfirmation: true,
        hasScheduleConflict: true,
        hasNoSlots: true,
      }),
    ]);
  });

  it('uses ranked allocation recommendations for ranked voting subscriptions', () => {
    const item = mapper.mapAdminQueueItem(
      createSubscription({
        subscriptionFlow: MajorEventSubscriptionFlow.RANKED_VOTING,
        amountMatched: true,
        matchedAmountText: 'R$ 10,00',
      }),
    );

    expect(allocator.allocateRankedEventIds).toHaveBeenCalled();
    expect(item.events[0].selectedForConfirmation).toBe(true);
    expect(item.events[1].selectedForConfirmation).toBe(false);
    expect(item.receipt?.amountMatched).toBe(true);
    expect(item.receipt?.matchedAmountText).toBe('R$ 10,00');
  });

  it('maps current-user receipt responses', () => {
    const uploadedAt = new Date('2026-01-01T00:00:00.000Z');
    const expiresAt = new Date('2027-01-01T00:00:00.000Z');

    expect(
      mapReceipt({
        id: 'receipt-1',
        fileName: 'receipt.png',
        mimeType: 'image/png',
        sizeBytes: 123,
        uploadedAt,
        expiresAt,
        processingStatus: 'PROCESSED',
        amountMatched: true,
        nameMatched: false,
      } as never),
    ).toEqual({
      id: 'receipt-1',
      fileName: 'receipt.png',
      mimeType: 'image/png',
      sizeBytes: 123,
      uploadedAt,
      expiresAt,
      imageUrl: '/api/major-event-receipts/receipt-1/image',
      processingStatus: 'PROCESSED',
      amountMatched: true,
      nameMatched: false,
    });
  });
});

function createSubscription(overrides: {
  subscriptionFlow?: MajorEventSubscriptionFlow;
  amountMatched?: boolean;
  matchedAmountText?: string | null;
  nameMatched?: boolean;
} = {}) {
  const startDate = new Date('2026-01-01T10:00:00.000Z');
  const endDate = new Date('2026-01-01T11:00:00.000Z');

  return {
    id: 'subscription-1',
    majorEventId: 'major-1',
    majorEvent: {
      name: 'Major Event',
    },
    personId: 'person-1',
    person: {
      id: 'person-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
    },
    amountPaid: 1000,
    paymentTier: 'student',
    subscriptionFlow: overrides.subscriptionFlow ?? MajorEventSubscriptionFlow.REGULAR,
    desiredCourses: 1,
    desiredLectures: 0,
    desiredUncategorized: 0,
    subscriptionStatus: SubscriptionStatus.RECEIPT_UNDER_REVIEW,
    receiptRejectionReason: null,
    updatedAt: new Date('2026-01-01T09:00:00.000Z'),
    selectedEvents: [
      {
        preferenceOrder: 1,
        event: {
          id: 'event-1',
          name: 'First',
          emoji: 'spark',
          type: 'MINICURSO',
          eventGroupId: null,
          eventGroup: null,
          startDate,
          endDate,
          locationDescription: null,
          slots: 10,
          slotsAvailable: 2,
          autoSubscribe: false,
        },
      },
      {
        preferenceOrder: 2,
        event: {
          id: 'event-2',
          name: 'Second',
          emoji: 'talk',
          type: 'PALESTRA',
          eventGroupId: 'group-1',
          eventGroup: {
            name: 'Group',
          },
          startDate: new Date('2026-01-01T10:30:00.000Z'),
          endDate: new Date('2026-01-01T11:30:00.000Z'),
          locationDescription: 'Room 1',
          slots: 1,
          slotsAvailable: 0,
          autoSubscribe: false,
        },
      },
    ],
    receipts: [
      {
        id: 'receipt-1',
        fileName: 'receipt.png',
        mimeType: 'image/png',
        sizeBytes: 123,
        uploadedAt: new Date('2026-01-01T08:00:00.000Z'),
        expiresAt: new Date('2027-01-01T08:00:00.000Z'),
        processingStatus: 'PROCESSED',
        ocrText: 'ocr',
        amountMatched: overrides.amountMatched ?? null,
        matchedAmountText: overrides.matchedAmountText ?? null,
        nameMatched: overrides.nameMatched ?? null,
        matchedNameText: null,
      },
    ],
  } as never;
}
