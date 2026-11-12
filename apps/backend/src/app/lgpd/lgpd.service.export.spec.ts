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

  it('exports lecturer profiles for all resolved people, including LinkedIn and contact data', async () => {
    const { prisma, service } = context;
    const profile = {
      id: 'profile-1',
      personId: 'source-person',
      displayName: 'Lecturer',
      biography: 'Biography',
      linkedin: 'lecturer-linkedin',
      email: 'lecturer@example.com',
      whatsapp: '18999990000',
      googleUserPicture: 'https://example.com/picture',
      publishGoogleUserPicture: true,
    };
    prisma.lecturerProfile.findMany.mockResolvedValue([profile]);

    const result = await service.collectUserData({ userId: 'new-user' });

    expect(result.lecturerProfiles).toEqual({ records: [expect.objectContaining(profile)] });
    expect(prisma.lecturerProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { personId: { in: ['source-person', 'target-person'] } },
        select: expect.objectContaining({ linkedin: true, biography: true, whatsapp: true }),
      }),
    );
  });

  it('exports merged source and target identities when the request uses the final user id', async () => {
    const { prisma, service } = context;
    prisma.eventSubscription.findMany.mockResolvedValue([{ id: 'moved-subscription' }]);
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
    prisma.prizeDrawManualEntry.findMany.mockResolvedValue([
      { id: 'manual-1', drawId: 'draw-1', personId: 'source-person' },
    ]);
    prisma.prizeDrawExcludedPerson.findMany.mockResolvedValue([{ drawId: 'draw-1', personId: 'target-person' }]);
    prisma.prizeDrawFrozenEntry.findMany.mockResolvedValue([
      { id: 'frozen-1', drawId: 'draw-1', personId: 'source-person' },
    ]);
    prisma.prizeDrawSpinEntry.findMany.mockResolvedValue([
      { id: 'entry-1', spinId: 'spin-1', personId: 'source-person' },
    ]);
    prisma.prizeDrawSpin.findMany.mockResolvedValue([{ id: 'spin-1', winnerPersonId: 'target-person' }]);

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
        }),
      ],
    });
    expect(result.prizeDraws).toEqual({
      manualEntries: [expect.objectContaining({ id: 'manual-1', personId: 'source-person' })],
      exclusions: [expect.objectContaining({ personId: 'target-person' })],
      frozenEntries: [expect.objectContaining({ id: 'frozen-1' })],
      spinEntries: [expect.objectContaining({ id: 'entry-1' })],
      wins: [expect.objectContaining({ id: 'spin-1', winnerPersonId: 'target-person' })],
    });
    for (const delegate of [
      prisma.prizeDrawManualEntry,
      prisma.prizeDrawExcludedPerson,
      prisma.prizeDrawFrozenEntry,
      prisma.prizeDrawSpinEntry,
    ]) {
      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { personId: { in: ['source-person', 'target-person'] } } }),
      );
    }
    expect(prisma.prizeDrawSpin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { winnerPersonId: { in: ['source-person', 'target-person'] } } }),
    );
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
    expect(exportedReceipts[0]).not.toHaveProperty('ocrText');
    expect(result.receipts).not.toHaveProperty('receiptValidationActions');
    expect(result.prizeDraws).not.toHaveProperty('weightOverrides');
    expect(prisma.prizeDrawWeightOverride.findMany).not.toHaveBeenCalled();
    expect(prisma.offlineEventAttendanceSubmission.findMany).not.toHaveBeenCalled();
    const receiptSelect = prisma.majorEventReceipt.findMany.mock.calls[0]?.[0]?.select;
    expect(receiptSelect).not.toHaveProperty('objectKey');
    expect(receiptSelect).not.toHaveProperty('subscription');
    expect(receiptSelect).not.toHaveProperty('validationActions');
    expect(prisma.auditLogEntry.findMany).not.toHaveBeenCalled();
  });

  it('exports only selected personal participation, certificate, draw and receipt fields', async () => {
    const { prisma, service } = context;
    prisma.eventAttendance.findMany.mockResolvedValue([
      {
        eventId: 'event-1',
        personId: 'source-person',
        category: 'OTHER',
        createdByMethod: 'SCANNER',
        collectedLatitude: 1,
        collectedLongitude: 2,
        collectedAccuracyMeters: 3,
      },
    ]);
    prisma.certificate.findMany.mockResolvedValue([
      {
        id: 'certificate-1',
        personId: 'source-person',
        issuedAt: new Date(),
        renderedData: { templateData: { content: 'internal template' } },
        configId: 'config-1',
      },
    ]);
    prisma.prizeDrawSpinEntry.findMany.mockResolvedValue([
      {
        id: 'entry-1',
        personId: 'source-person',
        winner: true,
        weight: 5,
        sources: ['internal'],
      },
    ]);
    prisma.majorEventReceipt.findMany.mockResolvedValue([
      {
        id: 'receipt-1',
        personId: 'source-person',
        processingStatus: 'COMPLETED',
        ocrText: 'third-party bank details',
        processingError: 'internal error',
      },
    ]);

    const result = await service.collectUserData({ userId: 'new-user' });
    const attendance = (result.attendances as { records: Record<string, unknown>[] }).records[0];
    const certificate = (result.certificates as { records: Record<string, unknown>[] }).records[0];
    const entry = (result.prizeDraws as { spinEntries: Record<string, unknown>[] }).spinEntries[0];
    const receipt = (result.receipts as { majorEventReceipts: Record<string, unknown>[] }).majorEventReceipts[0];
    expect(attendance).toEqual(expect.objectContaining({ eventId: 'event-1', personId: 'source-person' }));
    for (const field of [
      'category',
      'createdByMethod',
      'collectedLatitude',
      'collectedLongitude',
      'collectedAccuracyMeters',
    ]) {
      expect(attendance).not.toHaveProperty(field);
      expect(prisma.eventAttendance.findMany.mock.calls[0][0].select).not.toHaveProperty(field);
    }
    expect(certificate).toEqual(expect.objectContaining({ id: 'certificate-1', personId: 'source-person' }));
    expect(certificate).not.toHaveProperty('renderedData');
    expect(prisma.certificate.findMany.mock.calls[0][0].select).not.toHaveProperty('renderedData');
    expect(entry).toEqual(expect.objectContaining({ id: 'entry-1', winner: true }));
    expect(entry).not.toHaveProperty('weight');
    expect(entry).not.toHaveProperty('sources');
    expect(receipt).toEqual(expect.objectContaining({ id: 'receipt-1', processingStatus: 'COMPLETED' }));
    expect(receipt).not.toHaveProperty('ocrText');
    expect(receipt).not.toHaveProperty('processingError');
  });

  it('excludes certificate event details from the query and export', async () => {
    const { prisma, service } = context;
    const issuedAt = new Date();
    prisma.certificate.findMany.mockResolvedValue([
      {
        id: 'certificate-1',
        personId: 'source-person',
        issuedAt,
        deletedAt: null,
        renderedData: {
          events: [{ name: 'Event name', startDate: new Date(), credits: 8 }],
          target: { name: 'Event group', credits: 12 },
        },
      },
    ]);

    const result = await service.collectUserData({ userId: 'new-user' });

    expect(result.certificates).toEqual({
      records: [{ id: 'certificate-1', personId: 'source-person', issuedAt, deletedAt: null }],
    });
    expect(prisma.certificate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, personId: true, issuedAt: true, deletedAt: true },
      }),
    );
  });
});
