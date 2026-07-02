import {
  createLgpdServiceTestContext,
  LgpdServiceTestContext,
  restoreLgpdServiceTestContext,
} from './lgpd.service.spec-support';

describe('LgpdService hard delete', () => {
  let context: LgpdServiceTestContext;

  beforeEach(() => {
    context = createLgpdServiceTestContext();
  });

  afterEach(() => {
    restoreLgpdServiceTestContext();
  });

  it('hard deletes source and target identities when the request uses the old merged user id', async () => {
    const { prisma, s3, tx, typesenseSearch, service } = context;
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
    tx.eventDraft.findMany.mockResolvedValue([
      {
        id: 'draft-created-by-subject',
        createdById: 'old-user',
        createdByEmail: 'old@example.com',
        updatedById: 'admin-user',
        updatedByEmail: 'admin@example.com',
      },
      {
        id: 'draft-updated-by-subject',
        createdById: 'admin-user',
        createdByEmail: 'admin@example.com',
        updatedById: 'new-user',
        updatedByEmail: 'new@example.com',
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
      recordsDeleted: 7,
    });

    expect(tx.eventDraft.update).toHaveBeenCalledWith({
      where: { id: 'draft-created-by-subject' },
      data: {
        createdById: anonymizedAuditSubjectId,
        createdByName: 'Usuário anonimizado',
        createdByEmail: null,
      },
    });
    expect(tx.eventDraft.update).toHaveBeenCalledWith({
      where: { id: 'draft-updated-by-subject' },
      data: {
        updatedById: anonymizedAuditSubjectId,
        updatedByName: 'Usuário anonimizado',
        updatedByEmail: null,
      },
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
});
