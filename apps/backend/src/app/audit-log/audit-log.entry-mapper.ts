import { AuditLogEntry as PrismaAuditLogEntry, Prisma } from '@prisma/client';
import { getAuditFieldLabel } from './audit-log.field-labels';
import { AuditLogEntry, AuditLogExplorerEntry } from './audit-log.models';
import { formatAuditValue, parseAuditChanges } from './audit-log.snapshots';

export function mapAuditLogEntry(
  entry: PrismaAuditLogEntry,
  canRevert: (entry: PrismaAuditLogEntry) => boolean,
): AuditLogEntry {
  const changes = parseAuditChanges(entry.changes);
  return {
    id: entry.id,
    entityType: entry.entityType,
    entityId: entry.entityId,
    entityLabel: entry.entityLabel,
    operation: entry.operation,
    summary: entry.summary,
    actorId: entry.actorId,
    actorName: entry.actorName,
    actorEmail: entry.actorEmail,
    actorType: entry.actorType,
    permission: entry.permission,
    eventId: entry.eventId,
    majorEventId: entry.majorEventId,
    eventGroupId: entry.eventGroupId,
    changes: changes.map((change) => ({
      field: change.field,
      label: change.label ?? getAuditFieldLabel(change.field),
      beforeValue: formatAuditValue(change.before),
      afterValue: formatAuditValue(change.after),
    })),
    changedFields: entry.changedFields,
    groupedCount: entry.groupedCount,
    firstRecordedAt: entry.firstRecordedAt,
    lastRecordedAt: entry.lastRecordedAt,
    createdAt: entry.createdAt,
    revertedAt: entry.revertedAt,
    revertedById: entry.revertedById,
    revertedByName: entry.revertedByName,
    revertedByEntryId: entry.revertedByEntryId,
    revertTargetId: entry.revertTargetId,
    revertMode: entry.revertMode,
    canRevert: canRevert(entry),
  };
}

export function mapAuditLogExplorerEntry(
  entry: PrismaAuditLogEntry,
  canRevert: (entry: PrismaAuditLogEntry) => boolean,
): AuditLogExplorerEntry {
  return {
    ...mapAuditLogEntry(entry, canRevert),
    beforeJson: stringifyAuditJson(entry.before),
    afterJson: stringifyAuditJson(entry.after),
    metadataJson: stringifyAuditJson(entry.metadata),
  };
}

function stringifyAuditJson(value: Prisma.JsonValue | null): string | null {
  if (value === null) {
    return null;
  }

  return JSON.stringify(value, null, 2);
}
