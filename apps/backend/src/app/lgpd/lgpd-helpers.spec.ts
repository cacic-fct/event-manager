import { AuditLogEntityType } from '@prisma/client';
import {
  ANONYMIZED_AUDIT_VALUE,
  anonymizeAuditEntries,
  buildAnonymizedAuditSubjectId,
  buildAuditLogSubjectWhere,
} from './lgpd-audit-anonymization';
import { resolveDataSubject } from './lgpd-data-subject';
import { anonymizeEventDrafts, buildEventDraftSubjectWhere } from './lgpd-event-drafts';
import {
  mapAuditLogEntryForExport,
  mapOfflineSubmissionForExport,
  mapPersonForExport,
  selectForExport,
} from './lgpd-export-mappers';
import {
  anonymizeOfflineAttendanceSubmissions,
  buildOfflineSubmissionSubjectWhere,
  getOfflineManualSubjectValueCandidates,
} from './lgpd-offline-submissions';
import type { DataSubjectResolution } from './lgpd-records';

describe('LGPD helper modules', () => {
  it('resolves users, merged accounts, people, secondary emails, and Keycloak external refs', async () => {
    const users = [
      { id: 'old-user', email: 'old@example.com' },
      { id: 'new-user', email: 'new@example.com' },
      { id: 'external-user', email: 'external@example.com' },
    ];
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue(users),
      },
      accountUserMerge: {
        findMany: jest.fn().mockResolvedValue([{ oldUserId: 'old-user', newUserId: 'new-user' }]),
      },
      externalAccountMergeOperation: {
        findMany: jest.fn().mockResolvedValue([{ oldUserId: 'new-user', newUserId: 'external-user' }]),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'source-person' }]),
      people: {
        findMany: jest.fn((args: { include?: object }) => {
          if (args.include) {
            return Promise.resolve([
              personRecord({ id: 'source-person', userId: 'old-user', mergedIntoId: 'target-person' }),
              personRecord({ id: 'target-person', userId: 'new-user' }),
            ]);
          }

          return Promise.resolve([
            {
              id: 'source-person',
              userId: 'old-user',
              externalRef: 'kc:external-user',
              mergedIntoId: 'target-person',
              email: 'old@example.com',
              secondaryEmails: ['alias@example.com'],
            },
            {
              id: 'target-person',
              userId: 'new-user',
              externalRef: null,
              mergedIntoId: null,
              email: 'new@example.com',
              secondaryEmails: [],
            },
          ]);
        }),
      },
    };

    await expect(resolveDataSubject(prisma as never, { userId: ' old-user ', email: ' ALIAS@example.com ' }))
      .resolves.toEqual({
        userIds: expect.arrayContaining(['old-user', 'new-user', 'external-user']),
        personIds: ['source-person', 'target-person'],
        emails: expect.arrayContaining(['alias@example.com', 'old@example.com', 'new@example.com']),
        people: [
          expect.objectContaining({ id: 'source-person' }),
          expect.objectContaining({ id: 'target-person' }),
        ],
      });
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('maps export payloads without exposing non-selected nested fields', () => {
    expect(
      selectForExport(
        {
          id: 'record-1',
          secret: 'hidden',
          nested: { id: 'nested-1', secret: 'hidden' },
          rows: [{ id: 'row-1', secret: 'hidden' }, null],
        },
        {
          id: true,
          nested: { select: { id: true } },
          rows: { select: { id: true } },
        },
      ),
    ).toEqual({
      id: 'record-1',
      nested: { id: 'nested-1' },
      rows: [{ id: 'row-1' }],
    });

    expect(mapPersonForExport(personRecord({ id: 'person-1', mergedFrom: [{ id: 'merged-person' }] }))).toEqual(
      expect.objectContaining({
        id: 'person-1',
        mergedFromIds: ['merged-person'],
      }),
    );
  });

  it('redacts offline submissions and audit entries to subject-matching identities', () => {
    const dataSubject = dataSubjectResolution();

    expect(
      mapOfflineSubmissionForExport(
        {
          id: 'offline-1',
          clientId: 'client-1',
          eventId: 'event-1',
          personId: 'person-1',
          status: 'PENDING',
          createdByMethod: 'SCANNER',
          scannerCode: 'user:other-user',
          manualValue: 'subject@example.com',
          collectedAt: new Date('2026-07-01T12:00:00.000Z'),
          authorUserId: 'other-user',
          authorName: 'Other User',
          authorEmail: 'other@example.com',
          submittedById: 'subject-user',
          submittedAt: new Date('2026-07-01T12:00:00.000Z'),
          stagedReason: 'Coleta fora da janela.',
          resolutionError: null,
          collectedLatitude: -22.1,
          collectedLongitude: -51.4,
          collectedAccuracyMeters: 30,
          committedAt: null,
          committedById: 'other-user',
          rejectedAt: null,
          rejectedById: null,
          rejectionReason: null,
        } as never,
        dataSubject,
      ),
    ).toEqual(
      expect.objectContaining({
        scannerCode: null,
        authorUserId: null,
        authorName: null,
        authorEmail: null,
        submittedById: 'subject-user',
        submittedBySubject: true,
        committedById: null,
        committedBySubject: false,
      }),
    );

    expect(
      mapAuditLogEntryForExport(
        {
          id: 'audit-1',
          entityType: AuditLogEntityType.EVENT_ATTENDANCE,
          entityId: 'person-1:event-1',
          operation: 'USER_CREATE',
          actorId: 'other-user',
          actorType: 'USER',
          permission: 'event-attendance#collect',
          before: null,
          after: { personId: 'person-1', submittedById: 'subject-user' },
          changes: [],
          metadata: null,
          changedFields: ['personId'],
          groupedCount: 1,
          firstRecordedAt: new Date('2026-07-01T12:00:00.000Z'),
          lastRecordedAt: new Date('2026-07-01T12:00:00.000Z'),
          createdAt: new Date('2026-07-01T12:00:00.000Z'),
          revertedAt: null,
          revertedById: 'subject-user',
          revertedByEntryId: null,
          revertTargetId: null,
          revertMode: null,
        } as never,
        dataSubject,
      ),
    ).toEqual(
      expect.objectContaining({
        entityId: 'person-1:event-1',
        actorId: null,
        actorMatchesSubject: false,
        entityMatchesSubject: true,
        payloadMatchesSubject: true,
        changedFields: ['personId'],
        revertedById: 'subject-user',
        revertedBySubject: true,
      }),
    );
  });

  it('builds audit-log subject filters and anonymizes matching audit payloads', async () => {
    const dataSubject = dataSubjectResolution();
    const anonymizedSubjectId = buildAnonymizedAuditSubjectId(' request 1 ');
    const tx = {
      auditLogEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'audit-1',
            actorId: 'subject-user',
            actorName: 'Subject User',
            actorEmail: 'subject@example.com',
            entityType: AuditLogEntityType.PERSON,
            entityId: 'person-1',
            entityLabel: 'Subject User',
            before: {
              id: 'person-1',
              name: 'Subject User',
              email: 'subject@example.com',
            },
            after: {
              id: 'person-1',
              phone: '+55 18 99999-0000',
            },
            changes: [{ field: 'email', before: 'subject@example.com', after: 'alias@example.com' }],
            metadata: {
              offlineAttendanceAuthor: {
                userId: 'subject-user',
                email: 'subject@example.com',
              },
            },
          },
        ]),
        update: jest.fn(),
      },
    };

    expect(buildAuditLogSubjectWhere(dataSubject)).toEqual({
      OR: expect.arrayContaining([
        { actorId: { in: ['subject-user'] } },
        { entityType: AuditLogEntityType.PERSON, entityId: { in: ['person-1'] } },
        {
          entityType: AuditLogEntityType.EVENT_ATTENDANCE,
          entityId: { startsWith: 'person-1:' },
        },
        { after: { path: ['personId'], equals: 'person-1' } },
      ]),
    });

    await expect(anonymizeAuditEntries(tx as never, dataSubject, anonymizedSubjectId)).resolves.toEqual(['audit-1']);
    expect(tx.auditLogEntry.update).toHaveBeenCalledWith({
      where: { id: 'audit-1' },
      data: expect.objectContaining({
        actorId: null,
        actorName: 'Usuário anonimizado',
        actorEmail: null,
        entityId: anonymizedSubjectId,
        entityLabel: 'Dados anonimizados',
        before: {
          id: anonymizedSubjectId,
          name: ANONYMIZED_AUDIT_VALUE,
          email: ANONYMIZED_AUDIT_VALUE,
        },
        after: {
          id: anonymizedSubjectId,
          phone: ANONYMIZED_AUDIT_VALUE,
        },
        changes: [{ field: 'email', before: ANONYMIZED_AUDIT_VALUE, after: ANONYMIZED_AUDIT_VALUE }],
        metadata: {
          offlineAttendanceAuthor: {
            userId: anonymizedSubjectId,
            email: ANONYMIZED_AUDIT_VALUE,
          },
        },
      }),
    });
  });

  it('builds and applies event draft anonymization updates', async () => {
    const dataSubject = dataSubjectResolution();
    const tx = {
      eventDraft: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'draft-1',
            createdById: 'subject-user',
            createdByEmail: 'subject@example.com',
            updatedById: 'other-user',
            updatedByEmail: 'subject@example.com',
          },
          {
            id: 'draft-2',
            createdById: 'other-user',
            createdByEmail: 'other@example.com',
            updatedById: null,
            updatedByEmail: null,
          },
        ]),
        update: jest.fn(),
      },
    };

    expect(buildEventDraftSubjectWhere(dataSubject)).toEqual({
      OR: expect.arrayContaining([
        { createdById: { in: ['subject-user'] } },
        { updatedById: { in: ['subject-user'] } },
        { createdByEmail: { equals: 'subject@example.com', mode: 'insensitive' } },
        { updatedByEmail: { equals: 'subject@example.com', mode: 'insensitive' } },
      ]),
    });
    await expect(anonymizeEventDrafts(tx as never, dataSubject, 'anonymized:request-1')).resolves.toBe(1);
    expect(tx.eventDraft.update).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: {
        createdById: 'anonymized:request-1',
        createdByName: 'Usuário anonimizado',
        createdByEmail: null,
        updatedById: 'anonymized:request-1',
        updatedByName: 'Usuário anonimizado',
        updatedByEmail: null,
      },
    });
  });

  it('matches and anonymizes offline attendance submissions by subject identifiers', async () => {
    const dataSubject = dataSubjectResolution();
    const candidates = getOfflineManualSubjectValueCandidates(dataSubject);
    const tx = {
      offlineEventAttendanceSubmission: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'offline-1',
            personId: 'person-1',
            scannerCode: 'user:subject-user',
            manualValue: 'subject@example.com',
            authorUserId: 'subject-user',
            authorName: 'Subject User',
            authorEmail: 'subject@example.com',
            submittedById: 'subject-user',
            committedById: 'subject-user',
            rejectedById: null,
          },
        ]),
        update: jest.fn(),
      },
    };

    expect(candidates).toEqual(
      expect.arrayContaining([
        'subject@example.com',
        '+55 18 99999-0000',
        '18999990000',
        '529.982.247-25',
        '52998224725',
      ]),
    );
    expect(buildOfflineSubmissionSubjectWhere(dataSubject)).toEqual({
      OR: expect.arrayContaining([
        { personId: { in: ['person-1'] } },
        { scannerCode: { in: ['user:subject-user'] } },
        {
          manualValue: {
            in: expect.arrayContaining(['subject@example.com', '52998224725']),
            mode: 'insensitive',
          },
        },
      ]),
    });
    await expect(
      anonymizeOfflineAttendanceSubmissions(tx as never, dataSubject, 'anonymized:request-1'),
    ).resolves.toBe(1);
    expect(tx.offlineEventAttendanceSubmission.update).toHaveBeenCalledWith({
      where: { id: 'offline-1' },
      data: expect.objectContaining({
        personId: null,
        scannerCode: 'anonymized:request-1',
        manualValue: '[ANONIMIZADO]',
        authorUserId: 'anonymized:request-1',
        authorName: '[ANONIMIZADO]',
        authorEmail: null,
        submittedById: 'anonymized:request-1',
        committedById: 'anonymized:request-1',
      }),
    });
  });
});

function dataSubjectResolution(): DataSubjectResolution {
  return {
    userIds: ['subject-user'],
    personIds: ['person-1'],
    emails: ['subject@example.com'],
    people: [
      personRecord({
        id: 'person-1',
        email: 'subject@example.com',
        secondaryEmails: ['alias@example.com'],
        phone: '+55 18 99999-0000',
        identityDocument: '529.982.247-25',
        isCPF: true,
      }),
    ],
  };
}

function personRecord(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-07-01T12:00:00.000Z');
  return {
    id: 'person-1',
    name: 'Subject User',
    email: 'subject@example.com',
    secondaryEmails: [],
    phone: null,
    identityDocument: null,
    isCPF: true,
    academicId: null,
    userId: null,
    externalRef: null,
    mergedIntoId: null,
    mergedFrom: [],
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as never;
}
