import { AuditLogActorType, AuditLogEntityType, AuditLogEntry, AuditLogOperation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { AuditPrismaClient } from './audit-log.types';
import { synchronizeAuditLogEntry } from './audit-log.synchronization';

function createAuditEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'audit-1',
    entityType: AuditLogEntityType.PERSON,
    entityId: 'person-1',
    entityLabel: 'Pessoa 1',
    operation: AuditLogOperation.UPDATE,
    actorId: null,
    actorName: 'Sistema',
    actorEmail: null,
    actorType: AuditLogActorType.SYSTEM,
    permission: null,
    eventId: null,
    majorEventId: null,
    eventGroupId: null,
    before: null,
    after: null,
    changes: [],
    changedFields: [],
    metadata: null,
    revertedAt: null,
    revertedById: null,
    revertedEntryId: null,
    revertMode: null,
    groupedCount: 1,
    firstRecordedAt: new Date('2026-07-07T12:00:00.000Z'),
    lastRecordedAt: new Date('2026-07-07T12:00:00.000Z'),
    createdAt: new Date('2026-07-07T12:00:00.000Z'),
    updatedAt: new Date('2026-07-07T12:00:00.000Z'),
    ...overrides,
  } as AuditLogEntry;
}

function createCommittedPrismaMock() {
  return {
    auditLogEntry: {
      findUnique: jest.fn(),
    },
  };
}

function createTypesenseSearchMock() {
  return {
    upsertAuditLogEntry: jest.fn().mockResolvedValue(undefined),
  };
}

describe('synchronizeAuditLogEntry', () => {
  it('upserts immediately for committed Prisma clients and swallows indexing failures', async () => {
    const prisma = createCommittedPrismaMock();
    const typesenseSearch = createTypesenseSearchMock();
    const entry = createAuditEntry();
    typesenseSearch.upsertAuditLogEntry.mockRejectedValueOnce(new Error('Typesense unavailable'));

    synchronizeAuditLogEntry(
      entry,
      prisma as unknown as AuditPrismaClient,
      prisma as unknown as PrismaService,
      typesenseSearch as unknown as TypesenseSearchService,
    );
    await Promise.resolve();

    expect(typesenseSearch.upsertAuditLogEntry).toHaveBeenCalledWith(entry);
    expect(prisma.auditLogEntry.findUnique).not.toHaveBeenCalled();
  });

  it('defers transaction-scoped synchronization and swallows committed-read failures', async () => {
    jest.useFakeTimers();
    const tx = {};
    const committedPrisma = createCommittedPrismaMock();
    const typesenseSearch = createTypesenseSearchMock();
    const entry = createAuditEntry();
    committedPrisma.auditLogEntry.findUnique.mockRejectedValueOnce(new Error('database unavailable'));

    try {
      synchronizeAuditLogEntry(
        entry,
        tx as AuditPrismaClient,
        committedPrisma as unknown as PrismaService,
        typesenseSearch as unknown as TypesenseSearchService,
      );

      await jest.advanceTimersByTimeAsync(0);

      expect(committedPrisma.auditLogEntry.findUnique).toHaveBeenCalledWith({
        where: { id: 'audit-1' },
      });
      expect(typesenseSearch.upsertAuditLogEntry).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops retrying transaction-scoped synchronization after the retry budget is exhausted', async () => {
    jest.useFakeTimers();
    const tx = {};
    const committedPrisma = createCommittedPrismaMock();
    const typesenseSearch = createTypesenseSearchMock();
    const entry = createAuditEntry();
    committedPrisma.auditLogEntry.findUnique.mockResolvedValue(null);

    try {
      synchronizeAuditLogEntry(
        entry,
        tx as AuditPrismaClient,
        committedPrisma as unknown as PrismaService,
        typesenseSearch as unknown as TypesenseSearchService,
      );

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(25);
      await jest.advanceTimersByTimeAsync(100);
      await jest.advanceTimersByTimeAsync(500);
      await jest.advanceTimersByTimeAsync(1_000);
      await jest.advanceTimersByTimeAsync(2_500);
      await jest.advanceTimersByTimeAsync(10_000);

      expect(committedPrisma.auditLogEntry.findUnique).toHaveBeenCalledTimes(6);
      expect(typesenseSearch.upsertAuditLogEntry).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('swallows retry callback failures when the committed read starts failing later', async () => {
    jest.useFakeTimers();
    const tx = {};
    const committedPrisma = createCommittedPrismaMock();
    const typesenseSearch = createTypesenseSearchMock();
    const entry = createAuditEntry();
    committedPrisma.auditLogEntry.findUnique
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('database unavailable'));

    try {
      synchronizeAuditLogEntry(
        entry,
        tx as AuditPrismaClient,
        committedPrisma as unknown as PrismaService,
        typesenseSearch as unknown as TypesenseSearchService,
      );

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(25);

      expect(committedPrisma.auditLogEntry.findUnique).toHaveBeenCalledTimes(2);
      expect(typesenseSearch.upsertAuditLogEntry).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
