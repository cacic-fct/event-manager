import { AuditLogEntry as PrismaAuditLogEntry } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { AuditPrismaClient } from './audit-log.types';

const AUDIT_LOG_SYNC_RETRY_DELAYS_MS = [25, 100, 500, 1_000, 2_500] as const;

export function synchronizeAuditLogEntry(
  entry: PrismaAuditLogEntry,
  prisma: AuditPrismaClient,
  committedPrisma: PrismaService,
  typesenseSearch: TypesenseSearchService,
): void {
  if (prisma === committedPrisma) {
    void typesenseSearch.upsertAuditLogEntry(entry).catch(() => undefined);
    return;
  }

  setImmediate(() => {
    void synchronizeCommittedAuditLogEntry(entry, committedPrisma, typesenseSearch).catch(() => undefined);
  });
}

async function synchronizeCommittedAuditLogEntry(
  expectedEntry: PrismaAuditLogEntry,
  prisma: PrismaService,
  typesenseSearch: TypesenseSearchService,
  attempt = 0,
): Promise<void> {
  const entry = await prisma.auditLogEntry.findUnique({
    where: { id: expectedEntry.id },
  });
  if (!entry || entry.lastRecordedAt.getTime() < expectedEntry.lastRecordedAt.getTime()) {
    scheduleCommittedAuditLogEntryRetry(expectedEntry, prisma, typesenseSearch, attempt);
    return;
  }

  await typesenseSearch.upsertAuditLogEntry(entry);
}

function scheduleCommittedAuditLogEntryRetry(
  expectedEntry: PrismaAuditLogEntry,
  prisma: PrismaService,
  typesenseSearch: TypesenseSearchService,
  attempt: number,
): void {
  const delayMs = AUDIT_LOG_SYNC_RETRY_DELAYS_MS[attempt];
  if (delayMs === undefined) {
    return;
  }

  setTimeout(() => {
    void synchronizeCommittedAuditLogEntry(expectedEntry, prisma, typesenseSearch, attempt + 1).catch(() => undefined);
  }, delayMs);
}
