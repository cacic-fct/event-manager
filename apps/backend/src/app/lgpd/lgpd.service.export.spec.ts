import {
  createLgpdServiceTestContext,
  LgpdServiceTestContext,
  restoreLgpdServiceTestContext,
} from './lgpd.service.spec-support';

describe('LgpdService data export', () => {
  let context: LgpdServiceTestContext;

  beforeEach(() => {
    context = createLgpdServiceTestContext();
  });

  afterEach(() => {
    restoreLgpdServiceTestContext();
  });

  it('exports merged source and target identities when the request uses the final user id', async () => {
    const { prisma, service } = context;
    prisma.eventSubscription.findMany.mockResolvedValue([{ id: 'moved-subscription' }]);
    prisma.offlineEventAttendanceSubmission.findMany.mockResolvedValue([
      { id: 'offline-submission-1', personId: 'source-person', authorUserId: 'old-user' },
    ]);
    prisma.eventDraft.findMany.mockResolvedValue([
      {
        id: 'draft-1',
        sourceEventId: 'event-1',
        name: 'Draft',
        createdById: 'old-user',
        createdByName: 'Old User',
        createdByEmail: 'old@example.com',
        updatedById: 'new-user',
        updatedByName: 'New User',
        updatedByEmail: 'new@example.com',
        createdAt: new Date('2026-05-20T12:00:00.000Z'),
        updatedAt: new Date('2026-05-20T13:00:00.000Z'),
        expiresAt: new Date('2026-05-27T12:00:00.000Z'),
      },
    ]);
    prisma.majorEventReceipt.findMany.mockResolvedValueOnce([
      {
        id: 'receipt-1',
        personId: 'source-person',
        objectKey: 'receipts/receipt-1.avif',
        ocrText: 'Pagamento PIX de R$ 50,00',
      },
    ]);
    prisma.majorEventReceiptValidationAction.findMany.mockResolvedValueOnce([
      {
        id: 'action-1',
        subscriptionId: 'subscription-1',
        receiptId: 'receipt-1',
        nextRejectionReason: null,
      },
    ]);

    const result = await service.collectUserData({
      userId: 'new-user',
      email: 'old@example.com',
    });

    expect(result.metadata).toEqual(
      expect.objectContaining({
        generatedAt: '2026-05-21T12:00:00.000Z',
        resolvedUserIds: expect.arrayContaining(['old-user', 'new-user']),
        personIds: ['source-person', 'target-person'],
      }),
    );
    expect(result.accountUsers).toEqual({
      records: expect.arrayContaining([
        expect.objectContaining({ id: 'old-user', email: 'old@example.com' }),
        expect.objectContaining({ id: 'new-user', email: 'new@example.com' }),
      ]),
    });
    expect(result.people).toEqual({
      records: expect.arrayContaining([
        expect.objectContaining({ id: 'source-person', mergedIntoId: 'target-person' }),
        expect.objectContaining({ id: 'target-person' }),
      ]),
    });
    const exportedPeople = (result.people as { records: Record<string, unknown>[] }).records;
    expect(exportedPeople[0]).not.toHaveProperty('user');
    expect(exportedPeople[0]).not.toHaveProperty('mergedFrom');
    expect(exportedPeople[0]).not.toHaveProperty('mergedInto');
    expect(result.subscriptions).toEqual(
      expect.objectContaining({
        eventSubscriptions: [expect.objectContaining({ id: 'moved-subscription' })],
      }),
    );
    expect(result.mergeHistory).toEqual(
      expect.objectContaining({
        accountUserMerges: [{ oldUserId: 'old-user', newUserId: 'new-user' }],
      }),
    );
    expect(result.receipts).toEqual(
      expect.objectContaining({
        majorEventReceipts: [
          expect.objectContaining({
            id: 'receipt-1',
            personId: 'source-person',
            ocrText: 'Pagamento PIX de R$ 50,00',
          }),
        ],
        receiptValidationActions: [
          expect.objectContaining({
            id: 'action-1',
            subscriptionId: 'subscription-1',
            receiptId: 'receipt-1',
            nextRejectionReason: null,
          }),
        ],
      }),
    );
    const exportedReceipts = (result.receipts as { majorEventReceipts: Record<string, unknown>[] }).majorEventReceipts;
    expect(exportedReceipts[0]).not.toHaveProperty('objectKey');
    expect(result.eventDrafts).toEqual({
      records: [
        expect.objectContaining({
          id: 'draft-1',
          createdById: 'old-user',
          createdByEmail: 'old@example.com',
          updatedById: 'new-user',
          updatedByEmail: 'new@example.com',
        }),
      ],
    });
    expect(result.attendances).toEqual(
      expect.objectContaining({
        records: expect.any(Array),
        offlineSubmissions: [
          expect.objectContaining({
            id: 'offline-submission-1',
            personId: 'source-person',
            authorUserId: 'old-user',
            submittedById: null,
          }),
        ],
      }),
    );
    const exportedOfflineSubmissions = (
      result.attendances as { offlineSubmissions: Record<string, unknown>[] }
    ).offlineSubmissions;
    expect(exportedOfflineSubmissions[0]).not.toHaveProperty('event');
    expect(exportedOfflineSubmissions[0]).not.toHaveProperty('person');
    expect(result).not.toHaveProperty('auditHistory');
    expect(prisma.eventDraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: expect.arrayContaining([
            { createdById: { in: expect.arrayContaining(['old-user', 'new-user']) } },
            { updatedById: { in: expect.arrayContaining(['old-user', 'new-user']) } },
            { createdByEmail: { equals: 'old@example.com', mode: 'insensitive' } },
            { updatedByEmail: { equals: 'new@example.com', mode: 'insensitive' } },
          ]),
        },
        select: expect.objectContaining({
          createdById: true,
          createdByName: true,
          createdByEmail: true,
          updatedById: true,
          updatedByName: true,
          updatedByEmail: true,
        }),
      }),
    );
    expect(prisma.eventSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { personId: { in: ['source-person', 'target-person'] } },
        select: expect.objectContaining({
          id: true,
          eventId: true,
          personId: true,
        }),
      }),
    );
    expect(prisma.majorEventReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { personId: { in: ['source-person', 'target-person'] } },
        select: expect.objectContaining({
          id: true,
        }),
      }),
    );
    const receiptSelect = prisma.majorEventReceipt.findMany.mock.calls[0]?.[0]?.select;
    expect(receiptSelect).not.toHaveProperty('objectKey');
    expect(receiptSelect).not.toHaveProperty('subscription');
    expect(receiptSelect).not.toHaveProperty('validationActions');
    expect(prisma.auditLogEntry.findMany).not.toHaveBeenCalled();
    expect(prisma.offlineEventAttendanceSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: expect.arrayContaining([
            { personId: { in: expect.arrayContaining(['source-person', 'target-person']) } },
            { authorUserId: { in: expect.arrayContaining(['old-user', 'new-user']) } },
            { submittedById: { in: expect.arrayContaining(['old-user', 'new-user']) } },
            {
              manualValue: {
                in: expect.arrayContaining([
                  'old@example.com',
                  '+55 18 99999-0000',
                  '18999990000',
                  '(18) 99999-0000',
                  '52998224725',
                ]),
                mode: 'insensitive',
              },
            },
          ]),
        },
      }),
    );
    expect(prisma.majorEventReceiptValidationAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subscription: { personId: { in: ['source-person', 'target-person'] } } },
      }),
    );
  });
});
