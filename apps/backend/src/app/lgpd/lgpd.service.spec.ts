import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { S3Service } from '../s3/s3.service';
import { LgpdService } from './lgpd.service';

describe('LgpdService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let s3: ReturnType<typeof createS3Mock>;
  let typesenseSearch: ReturnType<typeof createTypesenseSearchMock>;
  let tx: ReturnType<typeof createTransactionMock>;
  let service: LgpdService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-21T12:00:00.000Z'));
    prisma = createPrismaMock();
    s3 = createS3Mock();
    typesenseSearch = createTypesenseSearchMock();
    tx = createTransactionMock();
    service = new LgpdService(
      prisma as unknown as PrismaService,
      s3 as unknown as S3Service,
      typesenseSearch as unknown as TypesenseSearchService,
    );

    prisma.user.findMany.mockImplementation(async (args: UserFindManyArgs) => findUsers(args));
    prisma.accountUserMerge.findMany.mockResolvedValue([{ oldUserId: 'old-user', newUserId: 'new-user' }]);
    prisma.externalAccountMergeOperation.findMany.mockResolvedValue([]);
    prisma.people.findMany.mockImplementation(async (args: PeopleFindManyArgs) => findPeople(args));
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.majorEventReceipt.findMany.mockResolvedValue([{ objectKey: 'receipts/old.png' }]);
    prisma.$transaction.mockImplementation(
      async (input: Promise<unknown>[] | ((transaction: typeof tx) => unknown)) =>
        Array.isArray(input) ? Promise.all(input) : input(tx),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('hard deletes source and target identities when the request uses the old merged user id', async () => {
    const anonymizedAuditSubjectId = 'anonymized:erase-1';

    tx.auditLogEntry.findMany.mockResolvedValue([
      {
        id: 'audit-1',
        entityType: 'PERSON',
        entityId: 'source-person',
        entityLabel: 'Source Person',
        actorId: 'old-user',
        actorName: 'Old User',
        actorEmail: 'old@example.com',
        before: { id: 'source-person', name: 'Previous Source Person', email: 'previous@example.com' },
        after: { id: 'source-person', name: 'Source Person', email: 'old@example.com' },
        changes: [{ field: 'name', before: 'Previous Source Person', after: 'Source Person' }],
        metadata: null,
      },
      {
        id: 'audit-attendance',
        entityType: 'EVENT_ATTENDANCE',
        entityId: 'source-person:event-1',
        entityLabel: 'Source Person',
        actorId: null,
        actorName: 'Admin',
        actorEmail: null,
        before: { personId: 'source-person', eventId: 'event-1' },
        after: { personId: 'source-person', eventId: 'event-1' },
        changes: [{ field: 'personId', before: 'source-person', after: 'source-person' }],
        metadata: null,
      },
      {
        id: 'audit-actor-only',
        entityType: 'EVENT',
        entityId: 'event-1',
        entityLabel: 'Presença registrada por Old User',
        actorId: 'old-user',
        actorName: 'Old User',
        actorEmail: 'old@example.com',
        before: { name: 'Event', createdById: 'old-user' },
        after: { name: 'Event', createdById: 'old-user', updatedById: 'old-user' },
        changes: [{ field: 'updatedById', before: null, after: 'old-user' }],
        metadata: { userId: 'old-user' },
      },
      {
        id: 'audit-updater-snapshot',
        entityType: 'EVENT',
        entityId: 'event-2',
        entityLabel: 'Edited by Old User',
        actorId: 'admin-user',
        actorName: 'Admin',
        actorEmail: 'admin@example.com',
        before: { name: 'Event 2', createdById: 'old-user' },
        after: { name: 'Event 2', createdById: 'old-user', updatedById: 'new-user' },
        changes: [{ field: 'updatedById', before: 'old-user', after: 'new-user' }],
        metadata: null,
      },
      {
        id: 'audit-actor-name-only',
        entityType: 'EVENT',
        entityId: 'event-3',
        entityLabel: 'Edited by Source Person',
        actorId: null,
        actorName: 'Source Person',
        actorEmail: null,
        before: { name: 'Event 3' },
        after: { name: 'Event 3' },
        changes: [],
        metadata: null,
      },
    ]);
    prisma.auditLogEntry.findMany.mockResolvedValue([
      {
        id: 'audit-1',
        entityLabel: 'Dados anonimizados',
      },
      {
        id: 'audit-attendance',
        entityId: 'anonymized%3Aerase-1:event-1',
      },
    ]);
    tx.offlineEventAttendanceSubmission.findMany.mockResolvedValue([
      {
        id: 'offline-submission-1',
        personId: 'source-person',
        scannerCode: 'user:old-user',
        manualValue: 'old@example.com',
        authorUserId: 'old-user',
        authorName: 'Old User',
        authorEmail: 'old@example.com',
        submittedById: 'old-user',
        committedById: null,
        rejectedById: null,
      },
    ]);

    await expect(
      service.hardDelete({
        userId: 'old-user',
        email: 'old@example.com',
        requestId: 'erase-1',
      }),
    ).resolves.toEqual({
      success: true,
      peopleDeleted: 2,
      usersDeleted: 2,
      recordsDeleted: 5,
    });

    expect(tx.eventSubscription.deleteMany).toHaveBeenCalledWith({
      where: { personId: { in: ['source-person', 'target-person'] } },
    });
    expect(tx.accountUserMerge.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { oldUserId: { in: ['old-user', 'new-user'] } },
          { newUserId: { in: ['old-user', 'new-user'] } },
        ],
      },
    });
    expect(tx.people.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['source-person', 'target-person'] } },
    });
    expect(tx.eventManagerPermissionGrant.deleteMany).toHaveBeenCalledWith({
      where: { userId: { in: ['old-user', 'new-user'] } },
    });
    expect(tx.user.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-user', 'new-user'] } },
    });
    expect(tx.auditLogEntry.findMany).toHaveBeenCalledWith({
      where: {
        OR: expect.arrayContaining([
          { actorId: { in: expect.arrayContaining(['old-user', 'new-user']) } },
          { before: { path: ['authorUserId'], equals: 'old-user' } },
          { before: { path: ['createdById'], equals: 'old-user' } },
          { metadata: { path: ['submittedById'], equals: 'old-user' } },
          { metadata: { path: ['offlineAttendanceAuthor', 'userId'], equals: 'old-user' } },
          { after: { path: ['updatedById'], equals: 'new-user' } },
          {
            entityType: 'EVENT_ATTENDANCE',
            entityId: { startsWith: 'source-person:' },
          },
        ]),
      },
    });
    const hardDeleteAuditWhere = tx.auditLogEntry.findMany.mock.calls[0]?.[0]?.where;
    expect(hardDeleteAuditWhere.OR).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ actorEmail: expect.anything() })]),
    );
    expect(hardDeleteAuditWhere.OR).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ actorName: expect.anything() })]),
    );
    expect(tx.auditLogEntry.update).toHaveBeenCalledWith({
      where: { id: 'audit-1' },
      data: expect.objectContaining({
        actorId: null,
        actorName: 'Usuário anonimizado',
        actorEmail: null,
        entityId: anonymizedAuditSubjectId,
        entityLabel: 'Dados anonimizados',
        before: expect.objectContaining({
          id: anonymizedAuditSubjectId,
          name: '[ANONIMIZADO]',
          email: '[ANONIMIZADO]',
        }),
        after: expect.objectContaining({
          id: anonymizedAuditSubjectId,
          name: '[ANONIMIZADO]',
          email: '[ANONIMIZADO]',
        }),
        changes: expect.arrayContaining([
          expect.objectContaining({
            field: 'name',
            before: '[ANONIMIZADO]',
            after: '[ANONIMIZADO]',
          }),
        ]),
      }),
    });
    expect(tx.auditLogEntry.update).toHaveBeenCalledWith({
      where: { id: 'audit-attendance' },
      data: expect.objectContaining({
        entityId: 'anonymized%3Aerase-1:event-1',
        entityLabel: 'Dados anonimizados',
        before: expect.objectContaining({
          personId: anonymizedAuditSubjectId,
          eventId: 'event-1',
        }),
        after: expect.objectContaining({
          personId: anonymizedAuditSubjectId,
          eventId: 'event-1',
        }),
        changes: expect.arrayContaining([
          expect.objectContaining({
            field: 'personId',
            before: anonymizedAuditSubjectId,
            after: anonymizedAuditSubjectId,
          }),
        ]),
      }),
    });
    expect(prisma.auditLogEntry.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: expect.arrayContaining([
            'audit-1',
            'audit-attendance',
            'audit-actor-only',
            'audit-updater-snapshot',
            'audit-actor-name-only',
          ]),
        },
      },
    });
    expect(typesenseSearch.upsertAuditLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'audit-1',
        entityLabel: 'Dados anonimizados',
      }),
    );
    expect(typesenseSearch.upsertAuditLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'audit-attendance',
        entityId: 'anonymized%3Aerase-1:event-1',
      }),
    );
    expect(tx.auditLogEntry.update).toHaveBeenCalledWith({
      where: { id: 'audit-actor-only' },
      data: expect.objectContaining({
        actorId: null,
        actorName: 'Usuário anonimizado',
        actorEmail: null,
        entityId: 'event-1',
        entityLabel: 'Dados anonimizados',
        before: expect.objectContaining({
          name: 'Event',
          createdById: anonymizedAuditSubjectId,
        }),
        after: expect.objectContaining({
          name: 'Event',
          createdById: anonymizedAuditSubjectId,
          updatedById: anonymizedAuditSubjectId,
        }),
        changes: expect.arrayContaining([
          expect.objectContaining({
            field: 'updatedById',
            before: null,
            after: anonymizedAuditSubjectId,
          }),
        ]),
        metadata: expect.objectContaining({
          userId: anonymizedAuditSubjectId,
        }),
      }),
    });
    expect(tx.auditLogEntry.update).toHaveBeenCalledWith({
      where: { id: 'audit-updater-snapshot' },
      data: expect.objectContaining({
        actorId: 'admin-user',
        actorName: 'Admin',
        actorEmail: 'admin@example.com',
        entityId: 'event-2',
        entityLabel: 'Dados anonimizados',
        before: expect.objectContaining({
          name: 'Event 2',
          createdById: anonymizedAuditSubjectId,
        }),
        after: expect.objectContaining({
          name: 'Event 2',
          createdById: anonymizedAuditSubjectId,
          updatedById: anonymizedAuditSubjectId,
        }),
        changes: expect.arrayContaining([
          expect.objectContaining({
            field: 'updatedById',
            before: anonymizedAuditSubjectId,
            after: anonymizedAuditSubjectId,
          }),
        ]),
      }),
    });
    expect(tx.auditLogEntry.update).toHaveBeenCalledWith({
      where: { id: 'audit-actor-name-only' },
      data: expect.objectContaining({
        actorId: null,
        actorName: 'Source Person',
        actorEmail: null,
        entityId: 'event-3',
        entityLabel: 'Edited by Source Person',
      }),
    });
    expect(s3.deleteFile).toHaveBeenCalledWith('receipts/old.png');
    expect(tx.majorEventReceiptValidationAction.deleteMany).toHaveBeenCalledWith({
      where: { subscription: { personId: { in: ['source-person', 'target-person'] } } },
    });
    expect(tx.majorEventReceipt.deleteMany).toHaveBeenCalledWith({
      where: { personId: { in: ['source-person', 'target-person'] } },
    });
    expect(tx.majorEventReceiptValidationAction.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.majorEventReceipt.deleteMany.mock.invocationCallOrder[0],
    );
    expect(tx.majorEventReceipt.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.majorEventSubscription.deleteMany.mock.invocationCallOrder[0],
    );
    expect(tx.eventManagerPermissionGrant.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.user.deleteMany.mock.invocationCallOrder[0],
    );
    expect(tx.offlineEventAttendanceSubmission.update).toHaveBeenCalledWith({
      where: { id: 'offline-submission-1' },
      data: expect.objectContaining({
        personId: null,
        scannerCode: anonymizedAuditSubjectId,
        manualValue: '[ANONIMIZADO]',
        authorUserId: anonymizedAuditSubjectId,
        authorName: '[ANONIMIZADO]',
        authorEmail: null,
        submittedById: anonymizedAuditSubjectId,
      }),
    });
    expect(tx.majorEventReceipt.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      s3.deleteFile.mock.invocationCallOrder[0],
    );
  });

  it('exports merged source and target identities when the request uses the final user id', async () => {
    const auditLogEntries = [
      {
        id: 'audit-person',
        entityType: 'PERSON',
        entityId: 'source-person',
        operation: 'UPDATE',
        actorId: 'admin-user',
        actorType: 'USER',
        permission: 'person:update',
        eventId: null,
        majorEventId: null,
        eventGroupId: null,
        before: { id: 'source-person', name: 'Source Person', email: 'old@example.com' },
        after: { id: 'target-person', name: 'Target Person', email: 'new@example.com' },
        changes: [{ field: 'email', before: 'old@example.com', after: 'new@example.com' }],
        changedFields: ['email'],
        groupedCount: 1,
        firstRecordedAt: new Date('2026-05-20T12:00:00.000Z'),
        lastRecordedAt: new Date('2026-05-20T12:00:00.000Z'),
        createdAt: new Date('2026-05-20T12:00:00.000Z'),
        revertedAt: null,
        revertedById: null,
        revertedByEntryId: null,
        revertTargetId: null,
        revertMode: null,
        metadata: null,
      },
    ];
    prisma.eventSubscription.findMany.mockResolvedValue([{ id: 'moved-subscription' }]);
    prisma.offlineEventAttendanceSubmission.findMany.mockResolvedValue([
      { id: 'offline-submission-1', personId: 'source-person', authorUserId: 'old-user' },
    ]);
    prisma.auditLogEntry.findMany.mockResolvedValue(auditLogEntries);
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
    expect(result.auditHistory).toEqual({
      records: [
        expect.objectContaining({
          id: 'audit-person',
          entityType: 'PERSON',
          entityId: 'source-person',
          operation: 'UPDATE',
          actorId: null,
          actorMatchesSubject: false,
          entityMatchesSubject: true,
          payloadMatchesSubject: true,
          changedFields: ['email'],
        }),
      ],
    });
    const exportedAuditRecords = (result.auditHistory as { records: Record<string, unknown>[] }).records;
    expect(exportedAuditRecords[0]).not.toHaveProperty('before');
    expect(exportedAuditRecords[0]).not.toHaveProperty('after');
    expect(exportedAuditRecords[0]).not.toHaveProperty('changes');
    expect(exportedAuditRecords[0]).not.toHaveProperty('metadata');
    expect(exportedAuditRecords[0]).not.toHaveProperty('actorName');
    expect(exportedAuditRecords[0]).not.toHaveProperty('actorEmail');
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
    expect(prisma.auditLogEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: expect.arrayContaining([
            { actorId: { in: expect.arrayContaining(['old-user', 'new-user']) } },
            {
              entityType: 'PERSON',
              entityId: { in: ['source-person', 'target-person'] },
            },
            {
              entityType: 'EVENT_ATTENDANCE',
              entityId: { startsWith: 'source-person:' },
            },
            {
              before: { path: ['personId'], equals: 'source-person' },
            },
            {
              after: { path: ['userId'], equals: 'new-user' },
            },
            {
              metadata: { path: ['offlineAttendanceAuthor', 'userId'], equals: 'old-user' },
            },
          ]),
        },
        select: expect.objectContaining({
          id: true,
          entityType: true,
          operation: true,
          before: true,
          after: true,
          changes: true,
          metadata: true,
        }),
        orderBy: { lastRecordedAt: 'desc' },
      }),
    );
    const auditSelect = prisma.auditLogEntry.findMany.mock.calls[0]?.[0]?.select;
    expect(auditSelect).not.toHaveProperty('actorName');
    expect(auditSelect).not.toHaveProperty('actorEmail');
    expect(auditSelect).not.toHaveProperty('entityLabel');
    expect(auditSelect).not.toHaveProperty('summary');
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
    const exportAuditWhere = prisma.auditLogEntry.findMany.mock.calls[0]?.[0]?.where;
    expect(exportAuditWhere.OR).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ actorEmail: expect.anything() })]),
    );
    expect(exportAuditWhere.OR).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ actorName: expect.anything() })]),
    );
    expect(prisma.majorEventReceiptValidationAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subscription: { personId: { in: ['source-person', 'target-person'] } } },
      }),
    );
  });

  it('removes receipt storage and database rows when scheduling deletion', async () => {
    tx.offlineEventAttendanceSubmission.findMany.mockResolvedValueOnce([
      {
        id: 'offline-submission-1',
        personId: 'source-person',
        scannerCode: null,
        manualValue: 'old@example.com',
        authorUserId: null,
        authorName: 'Old User',
        authorEmail: 'old@example.com',
        submittedById: 'new-user',
        committedById: null,
        rejectedById: null,
      },
    ]);

    await expect(
      service.scheduleDeletion({
        userId: 'old-user',
        email: 'old@example.com',
        requestId: 'schedule-1',
      }),
    ).resolves.toEqual({
      success: true,
      peopleUpdated: 2,
      recordsUpdated: 3,
    });

    expect(s3.deleteFile).toHaveBeenCalledWith('receipts/old.png');
    expect(tx.majorEventReceiptValidationAction.deleteMany).toHaveBeenCalledWith({
      where: { subscription: { personId: { in: ['source-person', 'target-person'] } } },
    });
    expect(tx.majorEventReceipt.deleteMany).toHaveBeenCalledWith({
      where: { personId: { in: ['source-person', 'target-person'] } },
    });
    expect(tx.majorEventReceiptValidationAction.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.majorEventReceipt.deleteMany.mock.invocationCallOrder[0],
    );
    expect(tx.majorEventReceipt.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.majorEventSubscription.updateMany.mock.invocationCallOrder[0],
    );
    expect(tx.majorEventReceipt.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      s3.deleteFile.mock.invocationCallOrder[0],
    );
    expect(tx.offlineEventAttendanceSubmission.update).toHaveBeenCalledWith({
      where: { id: 'offline-submission-1' },
      data: expect.objectContaining({
        personId: null,
        manualValue: '[ANONIMIZADO]',
        authorName: '[ANONIMIZADO]',
        authorEmail: null,
        submittedById: 'anonymized:schedule-1',
      }),
    });
  });

  it('does not fail anonymization when Typesense rejects an audit-log reindex', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    prisma.auditLogEntry.findMany.mockResolvedValue([{ id: 'audit-1', entityLabel: 'Dados anonimizados' }]);
    typesenseSearch.upsertAuditLogEntry.mockRejectedValueOnce(new Error('typesense down'));

    await expect(
      (
        service as unknown as {
          synchronizeAnonymizedAuditEntries(ids: readonly string[]): Promise<void>;
        }
      ).synchronizeAnonymizedAuditEntries(['audit-1']),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith('Falha ao reindexar audit log anonimizado audit-1: typesense down');
  });

  it('anonymizes unresolved offline manual submissions matched by phone or identity document', async () => {
    tx.offlineEventAttendanceSubmission.findMany.mockResolvedValueOnce([
      {
        id: 'offline-submission-phone',
        personId: null,
        scannerCode: null,
        manualValue: '(18) 99999-0000',
        authorUserId: null,
        authorName: null,
        authorEmail: null,
        submittedById: 'collector-user',
        committedById: null,
        rejectedById: null,
      },
      {
        id: 'offline-submission-document',
        personId: null,
        scannerCode: null,
        manualValue: '52998224725',
        authorUserId: null,
        authorName: null,
        authorEmail: null,
        submittedById: 'collector-user',
        committedById: null,
        rejectedById: null,
      },
    ]);

    await expect(
      service.scheduleDeletion({
        userId: 'old-user',
        email: 'old@example.com',
        requestId: 'schedule-1',
      }),
    ).resolves.toEqual({
      success: true,
      peopleUpdated: 2,
      recordsUpdated: 4,
    });

    expect(tx.offlineEventAttendanceSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: expect.arrayContaining([
            {
              manualValue: {
                in: expect.arrayContaining([
                  '+55 18 99999-0000',
                  '18999990000',
                  '(18) 99999-0000',
                  '529.982.247-25',
                  '52998224725',
                ]),
                mode: 'insensitive',
              },
            },
          ]),
        },
      }),
    );
    expect(tx.offlineEventAttendanceSubmission.update).toHaveBeenCalledWith({
      where: { id: 'offline-submission-phone' },
      data: { manualValue: '[ANONIMIZADO]' },
    });
    expect(tx.offlineEventAttendanceSubmission.update).toHaveBeenCalledWith({
      where: { id: 'offline-submission-document' },
      data: { manualValue: '[ANONIMIZADO]' },
    });
  });

  it('continues deleting receipt objects after an S3 cleanup failure', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    prisma.majorEventReceipt.findMany.mockResolvedValueOnce([
      { objectKey: 'receipts/old.png' },
      { objectKey: 'receipts/broken.png' },
      { objectKey: 'receipts/new.png' },
    ]);
    s3.deleteFile
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('s3 unavailable'))
      .mockResolvedValueOnce(undefined);

    await expect(
      service.scheduleDeletion({
        userId: 'old-user',
        email: 'old@example.com',
        requestId: 'schedule-1',
      }),
    ).resolves.toEqual({
      success: true,
      peopleUpdated: 2,
      recordsUpdated: 2,
    });

    expect(s3.deleteFile).toHaveBeenNthCalledWith(1, 'receipts/old.png');
    expect(s3.deleteFile).toHaveBeenNthCalledWith(2, 'receipts/broken.png');
    expect(s3.deleteFile).toHaveBeenNthCalledWith(3, 'receipts/new.png');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('receipts/broken.png'));
  });
});

type UserFindManyArgs = {
  where?: {
    id?: { in: string[] };
    OR?: Array<{ email?: { equals: string } }>;
  };
};

type PeopleFindManyArgs = {
  where?: {
    id?: { in: string[] };
    OR?: Array<{
      id?: { in: string[] };
      userId?: { in: string[] };
      externalRef?: { in: string[] };
      mergedIntoId?: { in: string[] };
    }>;
  };
  select?: unknown;
};

const users = [
  { id: 'old-user', email: 'old@example.com', name: 'Old User', createdAt: new Date('2025-01-01T00:00:00.000Z') },
  { id: 'new-user', email: 'new@example.com', name: 'New User', createdAt: new Date('2025-02-01T00:00:00.000Z') },
];

const people = [
  {
    id: 'source-person',
    name: 'Source Person',
    email: 'old@example.com',
    secondaryEmails: [],
    phone: '+55 18 99999-0000',
    identityDocument: '529.982.247-25',
    isCPF: true,
    academicId: null,
    userId: 'old-user',
    externalRef: 'kc:old-user',
    mergedIntoId: 'target-person',
    deletedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    user: users[0],
    mergedFrom: [],
    mergedInto: null,
  },
  {
    id: 'target-person',
    name: 'Target Person',
    email: 'new@example.com',
    secondaryEmails: ['old@example.com'],
    phone: null,
    identityDocument: null,
    isCPF: true,
    academicId: null,
    userId: 'new-user',
    externalRef: 'kc:new-user',
    mergedIntoId: null,
    deletedAt: null,
    createdAt: new Date('2025-02-01T00:00:00.000Z'),
    user: users[1],
    mergedFrom: [],
    mergedInto: null,
  },
];

function findUsers(args: UserFindManyArgs) {
  if (args.where?.id?.in) {
    return users.filter((user) => args.where?.id?.in.includes(user.id));
  }

  const emails = new Set(args.where?.OR?.map((condition) => condition.email?.equals.toLowerCase()).filter(Boolean));
  if (emails.size > 0) {
    return users.filter((user) => emails.has(user.email.toLowerCase()));
  }

  return [];
}

function findPeople(args: PeopleFindManyArgs) {
  if (args.where?.id?.in) {
    return people.filter((person) => args.where?.id?.in.includes(person.id));
  }

  if (args.select && args.where?.OR) {
    return people.filter((person) =>
      args.where?.OR?.some((condition) => {
        if (condition.id?.in.includes(person.id)) {
          return true;
        }
        if (person.userId && condition.userId?.in.includes(person.userId)) {
          return true;
        }
        if (person.externalRef && condition.externalRef?.in.includes(person.externalRef)) {
          return true;
        }

        return person.mergedIntoId ? condition.mergedIntoId?.in.includes(person.mergedIntoId) : false;
      }),
    );
  }

  return [];
}

function createPrismaMock() {
  const findManyDelegate = () => ({ findMany: jest.fn().mockResolvedValue([]) });
  const softDeleteDelegate = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  });

  return {
    user: {
      findMany: jest.fn(),
    },
    people: {
      findMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    accountUserMerge: {
      findMany: jest.fn(),
    },
    externalAccountMergeOperation: {
      findMany: jest.fn(),
    },
    eventSubscription: softDeleteDelegate(),
    eventGroupSubscription: softDeleteDelegate(),
    majorEventSubscription: softDeleteDelegate(),
    majorEventSubscriptionEventSelection: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    eventAttendance: findManyDelegate(),
    offlineEventAttendanceSubmission: findManyDelegate(),
    eventLecturer: findManyDelegate(),
    certificate: softDeleteDelegate(),
    majorEventReceipt: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    majorEventReceiptValidationAction: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    peopleMergeOperation: findManyDelegate(),
    mergeCandidate: findManyDelegate(),
    auditLogEntry: findManyDelegate(),
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
}

function createTransactionMock() {
  const writeManyDelegate = (count = 0) => ({
    updateMany: jest.fn().mockResolvedValue({ count }),
    deleteMany: jest.fn().mockResolvedValue({ count }),
  });
  const deleteManyDelegate = (count = 0) => ({
    deleteMany: jest.fn().mockResolvedValue({ count }),
  });

  return {
    auditLogEntry: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    certificate: writeManyDelegate(),
    majorEventSubscriptionEventSelection: writeManyDelegate(1),
    majorEventReceiptValidationAction: deleteManyDelegate(),
    majorEventReceipt: deleteManyDelegate(),
    eventSubscription: writeManyDelegate(1),
    eventGroupSubscription: writeManyDelegate(),
    majorEventSubscription: writeManyDelegate(),
    eventAttendance: deleteManyDelegate(),
    offlineEventAttendanceSubmission: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    eventLecturer: deleteManyDelegate(),
    externalAccountMergeOperation: deleteManyDelegate(),
    peopleMergeOperation: deleteManyDelegate(),
    mergeCandidate: deleteManyDelegate(),
    accountUserMerge: deleteManyDelegate(),
    eventManagerPermissionGrant: deleteManyDelegate(2),
    people: writeManyDelegate(2),
    user: deleteManyDelegate(2),
  };
}

function createS3Mock() {
  return {
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };
}

function createTypesenseSearchMock() {
  return {
    upsertAuditLogEntry: jest.fn().mockResolvedValue(undefined),
  };
}
