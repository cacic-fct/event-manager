import { Logger } from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import {
  ANONYMIZED_AUDIT_VALUE,
  anonymizeAuditEntries,
  anonymizeAuditJson,
  containsAuditIdentity,
  buildAuditLogSubjectWhere,
  synchronizeAnonymizedAuditEntries,
} from './lgpd-audit-anonymization';
import { LgpdService } from './lgpd.service';
import {
  createLgpdServiceTestContext,
  LgpdServiceTestContext,
  restoreLgpdServiceTestContext,
} from './lgpd.service.spec-support';

describe('synchronizeAnonymizedAuditEntries', () => {
  let context: LgpdServiceTestContext;

  beforeEach(() => {
    context = createLgpdServiceTestContext();
  });

  afterEach(() => {
    restoreLgpdServiceTestContext();
  });

  it('fails anonymization synchronization when Typesense rejects an audit-log reindex', async () => {
    const { prisma, typesenseSearch } = context;
    prisma.auditLogEntry.findMany.mockResolvedValue([{ id: 'audit-1', entityLabel: 'Dados anonimizados' }]);
    typesenseSearch.upsertAuditLogEntry.mockRejectedValueOnce(new Error('typesense down'));

    await expect(
      synchronizeAnonymizedAuditEntries(
        prisma as unknown as PrismaService,
        typesenseSearch as unknown as TypesenseSearchService,
        new Logger(LgpdService.name),
        ['audit-1'],
      ),
    ).rejects.toThrow('typesense down');
    expect(typesenseSearch.upsertAuditLogEntry).toHaveBeenCalledWith(expect.objectContaining({ id: 'audit-1' }), true);
  });
});

describe('merge candidate audit anonymization', () => {
  const dataSubject = {
    people: [],
    personIds: ['person-1'],
    userIds: [],
    emails: ['person@example.com'],
  };

  it('selects merge candidate snapshots linked through either person field', () => {
    const where = buildAuditLogSubjectWhere(dataSubject);

    expect(where.OR).toEqual(
      expect.arrayContaining([
        { before: { path: ['personAId'], equals: 'person-1' } },
        { after: { path: ['personBId'], equals: 'person-1' } },
      ]),
    );
  });

  it('selects people merge audit metadata linked through source or target person fields', () => {
    const where = buildAuditLogSubjectWhere(dataSubject);

    expect(where.OR).toEqual(
      expect.arrayContaining([
        { metadata: { path: ['sourcePersonId'], equals: 'person-1' } },
        { metadata: { path: ['targetPersonId'], equals: 'person-1' } },
      ]),
    );
  });

  it('anonymizes merge candidate identifiers and matching values', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const tx = {
      lecturerProfile: { findMany: jest.fn().mockResolvedValue([]) },
      auditLogEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'audit-1',
            entityType: AuditLogEntityType.MERGE_CANDIDATE,
            entityId: 'candidate-1',
            entityLabel: 'person-1:person-2',
            operation: AuditLogOperation.CREATE,
            actorId: null,
            actorName: null,
            actorEmail: null,
            before: null,
            after: {
              personAId: 'person-1',
              personBId: 'person-2',
              pairKey: 'person-1:person-2',
              matchValue: 'person@example.com',
            },
            changes: {},
            metadata: null,
          },
        ]),
        update,
      },
    } as unknown as Prisma.TransactionClient;

    await anonymizeAuditEntries(tx, dataSubject, 'anonymized:request-1');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'audit-1' },
      data: expect.objectContaining({
        entityLabel: 'Dados anonimizados',
        after: {
          personAId: 'anonymized:request-1',
          personBId: 'person-2',
          pairKey: ANONYMIZED_AUDIT_VALUE,
          matchValue: ANONYMIZED_AUDIT_VALUE,
        },
      }),
    });
  });

  it('anonymizes people merge source and target identifiers in audit metadata', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const tx = {
      lecturerProfile: { findMany: jest.fn().mockResolvedValue([]) },
      auditLogEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'audit-merge',
            entityType: AuditLogEntityType.PERSON,
            entityId: 'target-person',
            entityLabel: 'Target Person',
            operation: AuditLogOperation.MERGE,
            actorId: null,
            actorName: 'Admin',
            actorEmail: null,
            before: null,
            after: null,
            changes: {},
            metadata: {
              sourcePersonId: 'person-1',
              targetPersonId: 'person-2',
            },
          },
        ]),
        update,
      },
    } as unknown as Prisma.TransactionClient;

    await anonymizeAuditEntries(tx, dataSubject, 'anonymized:request-1');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'audit-merge' },
      data: expect.objectContaining({
        entityLabel: 'Dados anonimizados',
        metadata: {
          sourcePersonId: 'anonymized:request-1',
          targetPersonId: 'person-2',
        },
      }),
    });
  });

  it('anonymizes account merge user identifiers in audit metadata', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const tx = {
      lecturerProfile: { findMany: jest.fn().mockResolvedValue([]) },
      auditLogEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'audit-account-merge',
            entityType: AuditLogEntityType.SYSTEM,
            entityId: 'merge-event-1',
            entityLabel: 'Unificação de contas',
            operation: AuditLogOperation.MERGE,
            actorId: null,
            actorName: 'Serviço de unificação de contas',
            actorEmail: null,
            before: null,
            after: null,
            changes: {},
            metadata: {
              oldUserId: 'old-user',
              newUserId: 'new-user',
            },
          },
        ]),
        update,
      },
    } as unknown as Prisma.TransactionClient;

    await anonymizeAuditEntries(
      tx,
      { people: [], personIds: [], userIds: ['old-user'], emails: [] },
      'anonymized:request-1',
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 'audit-account-merge' },
      data: expect.objectContaining({
        entityLabel: 'Dados anonimizados',
        metadata: {
          oldUserId: 'anonymized:request-1',
          newUserId: 'new-user',
        },
      }),
    });
  });
});


describe('ticket audit subject anonymization', () => {
  it('selects ticket holder snapshots and person-derived source keys', () => {
    const where = buildAuditLogSubjectWhere({ people: [], personIds: ['person-1'], userIds: [], emails: [] });
    expect(where.OR).toEqual(expect.arrayContaining([
      { after: { path: ['holderPersonId'], equals: 'person-1' } },
      { before: { path: ['recipientPersonId'], equals: 'person-1' } },
      { after: { path: ['sourceKey'], string_ends_with: ':person-1' } },
    ]));
  });

  it('recognizes source-key-only ticket snapshots and changes as subject data', () => {
    const identities = new Set(['person-1']);
    expect(containsAuditIdentity({ sourceKey: 'event-subscription:event-1:person-1' }, identities, false)).toBe(true);
    expect(containsAuditIdentity([{ field: 'sourceKey', before: 'event-subscription:event-1:person-1', after: null }], identities, false)).toBe(true);
    expect(containsAuditIdentity({ sourceKey: 'event-subscription:event-1:person-10' }, identities, false)).toBe(false);
    expect(anonymizeAuditJson({ sourceKey: 'event-subscription:event-1:person-1' }, identities, identities, 'anonymous', [], false))
      .toEqual({ sourceKey: ANONYMIZED_AUDIT_VALUE });
  });

  it('scrubs ticket identities and source keys in snapshots and change arrays without matching neighboring IDs', () => {
    const identities = new Set(['person-1']);
    const value = {
      holderPersonId: 'person-1',
      sourceKey: 'event-subscription:event-1:person-1',
      unrelatedKey: 'event-subscription:event-1:person-10',
      changes: [{ field: 'sourceKey', before: 'event-subscription:event-1:person-1', after: 'major-event-subscription:event-1:person-1' }],
    };
    expect(anonymizeAuditJson(value, identities, identities, 'anonymous', [], false)).toEqual({
      holderPersonId: 'anonymous',
      sourceKey: ANONYMIZED_AUDIT_VALUE,
      unrelatedKey: 'event-subscription:event-1:person-10',
      changes: [{ field: 'sourceKey', before: ANONYMIZED_AUDIT_VALUE, after: ANONYMIZED_AUDIT_VALUE }],
    });
  });
});
