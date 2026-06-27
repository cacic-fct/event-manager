import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogExplorerInput, AuditLogExplorerRevertedStatus } from './audit-log.models';

const AUDIT_LOG_ACTOR_FILTER_FIELDS = ['actorId', 'actorName', 'actorEmail'] as const;
const AUDIT_LOG_ENTITY_FILTER_FIELDS = ['entityId', 'entityLabel', 'eventId', 'majorEventId', 'eventGroupId'] as const;

export function assertValidAuditLogExplorerDateRange(dateFrom?: Date | null, dateTo?: Date | null): void {
  if (dateFrom && Number.isNaN(dateFrom.getTime())) {
    throw new BadRequestException('A data inicial do filtro de auditoria é inválida.');
  }
  if (dateTo && Number.isNaN(dateTo.getTime())) {
    throw new BadRequestException('A data final do filtro de auditoria é inválida.');
  }
  if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
    throw new BadRequestException('A data inicial deve ser anterior à data final.');
  }
}

export function buildAuditLogSearchQuery(input: AuditLogExplorerInput): string {
  return input.query?.trim() ?? '';
}

export function buildAuditLogTypesenseFilter(input: AuditLogExplorerInput): string {
  const filters: string[] = [];

  if (input.entityType) {
    filters.push(`entityType:=${escapeTypesenseFilterValue(input.entityType)}`);
  }
  if (input.operation) {
    filters.push(`operation:=${escapeTypesenseFilterValue(input.operation)}`);
  }
  if (input.dateFrom) {
    filters.push(`lastRecordedAt:>=${toTypesenseTimestamp(input.dateFrom)}`);
  }
  if (input.dateTo) {
    filters.push(`lastRecordedAt:<=${toTypesenseTimestamp(input.dateTo)}`);
  }
  if (input.revertedStatus === AuditLogExplorerRevertedStatus.REVERTED) {
    filters.push('reverted:=true');
  }
  if (input.revertedStatus === AuditLogExplorerRevertedStatus.NOT_REVERTED) {
    filters.push('reverted:=false');
  }
  const actorFilter = buildAuditLogTypesenseTextFilter(input.actor, AUDIT_LOG_ACTOR_FILTER_FIELDS);
  if (actorFilter) {
    filters.push(actorFilter);
  }
  const entityFilter = buildAuditLogTypesenseTextFilter(input.entity, AUDIT_LOG_ENTITY_FILTER_FIELDS);
  if (entityFilter) {
    filters.push(entityFilter);
  }

  return filters.join(' && ');
}

export function buildAuditLogSqlWhere(input: AuditLogExplorerInput): Prisma.AuditLogEntryWhereInput {
  const conditions: Prisma.AuditLogEntryWhereInput[] = [];
  const recordedAt: Prisma.DateTimeFilter = {};

  if (input.entityType) {
    conditions.push({ entityType: input.entityType });
  }
  if (input.operation) {
    conditions.push({ operation: input.operation });
  }
  if (input.dateFrom) {
    recordedAt.gte = input.dateFrom;
  }
  if (input.dateTo) {
    recordedAt.lte = input.dateTo;
  }
  if (Object.keys(recordedAt).length > 0) {
    conditions.push({ lastRecordedAt: recordedAt });
  }
  if (input.revertedStatus === AuditLogExplorerRevertedStatus.REVERTED) {
    conditions.push({ revertedAt: { not: null } });
  }
  if (input.revertedStatus === AuditLogExplorerRevertedStatus.NOT_REVERTED) {
    conditions.push({ revertedAt: null });
  }

  const queryCondition = buildAuditLogTextCondition(input.query, [
    'entityId',
    'entityLabel',
    'summary',
    'actorId',
    'actorName',
    'actorEmail',
    'permission',
    'eventId',
    'majorEventId',
    'eventGroupId',
    'revertedById',
    'revertedByName',
    'revertedByEntryId',
    'revertTargetId',
  ]);
  if (queryCondition) {
    conditions.push(queryCondition);
  }

  const actorCondition = buildAuditLogTextCondition(input.actor, ['actorId', 'actorName', 'actorEmail']);
  if (actorCondition) {
    conditions.push(actorCondition);
  }

  const entityCondition = buildAuditLogTextCondition(input.entity, [
    'entityId',
    'entityLabel',
    'eventId',
    'majorEventId',
    'eventGroupId',
  ]);
  if (entityCondition) {
    conditions.push(entityCondition);
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

function buildAuditLogTextCondition(
  value: string | null | undefined,
  fields: readonly (keyof Prisma.AuditLogEntryWhereInput)[],
): Prisma.AuditLogEntryWhereInput | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return {
    OR: fields.map((field) => ({
      [field]: {
        contains: normalized,
        mode: Prisma.QueryMode.insensitive,
      },
    })),
  };
}

function escapeTypesenseFilterValue(value: string): string {
  return `\`${value.replace(/[`\\]/g, '\\$&')}\``;
}

function buildAuditLogTypesenseTextFilter(value: string | null | undefined, fields: readonly string[]): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const escaped = escapeTypesenseFilterValue(normalized);
  return `(${fields.map((field) => `${field}:${escaped}`).join(' || ')})`;
}

function toTypesenseTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}
