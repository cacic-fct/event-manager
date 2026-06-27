import { Prisma } from '@prisma/client';
import type { AuditLogSearchDocument, AuditLogSearchDocumentInput } from './typesense-search.types';
import { toOptionalString, toUnixTimestamp } from './typesense-search.shared';

export const AUDIT_LOG_SEARCH_SELECT = {
  id: true,
  entityType: true,
  entityId: true,
  entityLabel: true,
  operation: true,
  summary: true,
  actorId: true,
  actorName: true,
  actorEmail: true,
  actorType: true,
  permission: true,
  eventId: true,
  majorEventId: true,
  eventGroupId: true,
  before: true,
  after: true,
  changes: true,
  changedFields: true,
  groupedCount: true,
  firstRecordedAt: true,
  lastRecordedAt: true,
  createdAt: true,
  revertedAt: true,
  revertedById: true,
  revertedByName: true,
  revertedByEntryId: true,
  revertTargetId: true,
  revertMode: true,
  metadata: true,
} satisfies Prisma.AuditLogEntrySelect;

export const AUDIT_LOG_QUERY_BY = [
  'entityType',
  'entityId',
  'entityLabel',
  'operation',
  'summary',
  'actorId',
  'actorName',
  'actorEmail',
  'actorType',
  'permission',
  'eventId',
  'majorEventId',
  'eventGroupId',
  'changedFields',
  'changedFieldLabels',
  'changesText',
  'beforeText',
  'afterText',
  'metadataText',
  'revertedById',
  'revertedByName',
  'revertedByEntryId',
  'revertTargetId',
].join(',');

export function toAuditLogSearchDocument(input: AuditLogSearchDocumentInput): AuditLogSearchDocument {
  const changes = parseAuditLogChanges(input.changes);
  const changedFields = new Set(input.changedFields);
  const changedFieldLabels = changes
    .filter((change) => changedFields.has(change.field))
    .map((change) => change.label)
    .filter(Boolean);
  const changesText = toOptionalString(
    changes
      .flatMap((change) => [
        change.field,
        change.label,
        stringifyJsonForSearch(change.before),
        stringifyJsonForSearch(change.after),
      ])
      .filter((value): value is string => Boolean(value))
      .join(' '),
  );

  return {
    id: input.id,
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: toOptionalString(input.entityLabel),
    operation: input.operation,
    summary: toOptionalString(input.summary),
    actorId: toOptionalString(input.actorId),
    actorName: toOptionalString(input.actorName) ?? 'Sistema',
    actorEmail: toOptionalString(input.actorEmail),
    actorType: input.actorType,
    permission: toOptionalString(input.permission),
    eventId: toOptionalString(input.eventId),
    majorEventId: toOptionalString(input.majorEventId),
    eventGroupId: toOptionalString(input.eventGroupId),
    changedFields: input.changedFields.length > 0 ? input.changedFields : undefined,
    changedFieldLabels: changedFieldLabels.length > 0 ? changedFieldLabels : undefined,
    changesText,
    beforeText: stringifyJsonForSearch(input.before),
    afterText: stringifyJsonForSearch(input.after),
    metadataText: stringifyJsonForSearch(input.metadata ?? null),
    groupedCount: input.groupedCount,
    firstRecordedAt: toUnixTimestamp(input.firstRecordedAt),
    lastRecordedAt: toUnixTimestamp(input.lastRecordedAt),
    createdAt: toUnixTimestamp(input.createdAt),
    reverted: Boolean(input.revertedAt),
    revertedAt: input.revertedAt ? toUnixTimestamp(input.revertedAt) : undefined,
    revertedById: toOptionalString(input.revertedById),
    revertedByName: toOptionalString(input.revertedByName),
    revertedByEntryId: toOptionalString(input.revertedByEntryId),
    revertTargetId: toOptionalString(input.revertTargetId),
    revertMode: toOptionalString(input.revertMode),
  };
}

function parseAuditLogChanges(value: Prisma.JsonValue): {
  field: string;
  label: string;
  before: Prisma.JsonValue | undefined;
  after: Prisma.JsonValue | undefined;
}[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }

    const record = entry as Record<string, Prisma.JsonValue>;
    if (typeof record['field'] !== 'string') {
      return [];
    }

    return [
      {
        field: record['field'],
        label: typeof record['label'] === 'string' ? record['label'] : record['field'],
        before: record['before'],
        after: record['after'],
      },
    ];
  });
}

function stringifyJsonForSearch(value: Prisma.JsonValue | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    return toOptionalString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return toOptionalString(JSON.stringify(value));
  } catch {
    return undefined;
  }
}
