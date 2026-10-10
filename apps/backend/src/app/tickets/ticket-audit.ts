import { AuditLogActorType, AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';

export type TicketAuditEntityType = Extract<
  AuditLogEntityType,
  'TICKET' | 'TICKET_CONFIG' | 'TICKET_TRANSFER' | 'TICKET_PURCHASE'
>;

export type TicketAuditOperation = AuditLogOperation;

export type TicketAuditInput = {
  entityType: TicketAuditEntityType;
  entityId: string;
  entityLabel: string;
  operation: TicketAuditOperation;
  summary: string;
  actorUserId?: string | null;
  actorName?: string | null;
  permission?: string | null;
  eventId?: string | null;
  majorEventId?: string | null;
  before?: Prisma.InputJsonValue;
  after: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonObject;
};

/** Writes an append-only central audit record through the same transaction as the ticket mutation. */
export async function recordTicketAudit(
  tx: Prisma.TransactionClient,
  input: TicketAuditInput,
): Promise<void> {
  const actor = input.actorUserId
    ? await tx.user.findUnique({ where: { id: input.actorUserId }, select: { name: true, email: true } })
    : null;
  const actorName = input.actorName ?? actor?.name ?? 'Sistema';
  const after = input.after;
  const before = input.before;
  const changedFields = changedFieldNames(before, after);
  const changes = changedFields.map((field) => ({
    field,
    before: readField(before, field),
    after: readField(after, field),
  })) as unknown as Prisma.InputJsonArray;

  await tx.auditLogEntry.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: input.entityLabel,
      operation: input.operation,
      summary: input.summary,
      actorId: input.actorUserId ?? null,
      actorName,
      actorEmail: actor?.email ?? null,
      actorType: input.actorUserId ? AuditLogActorType.USER : AuditLogActorType.SERVICE,
      permission: input.permission ?? null,
      eventId: input.eventId ?? null,
      majorEventId: input.majorEventId ?? null,
      before: before ?? Prisma.JsonNull,
      after,
      changes,
      changedFields,
      firstRecordedAt: new Date(),
      lastRecordedAt: new Date(),
      metadata: input.metadata,
    },
  });
}

function changedFieldNames(before: Prisma.InputJsonValue | undefined, after: Prisma.InputJsonValue): string[] {
  const beforeRecord = asRecord(before);
  const afterRecord = asRecord(after);
  const keys = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]);
  const changed = [...keys].filter((key) => JSON.stringify(beforeRecord[key]) !== JSON.stringify(afterRecord[key]));
  return changed.length > 0 ? changed.sort() : ['state'];
}

function readField(value: Prisma.InputJsonValue | undefined, field: string): Prisma.InputJsonValue | null {
  const record = asRecord(value);
  const fieldValue = record[field];
  return fieldValue === undefined ? null : toJsonValue(fieldValue);
}

function asRecord(value: Prisma.InputJsonValue | undefined): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]));
  }
  return String(value);
}
