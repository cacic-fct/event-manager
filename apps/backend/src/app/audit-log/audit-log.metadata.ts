import type { Prisma } from '@prisma/client';

/** Removes rollback, replay, identity, and allocation details from batch metadata sent to API or search. */
export function sanitizeAuditMetadata(value: Prisma.JsonValue | null): Prisma.JsonValue | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  if (value['type'] === 'data-transfer-batch') {
    const summary = safeTransferSummary(value['summary']);
    const version =
      typeof value['version'] === 'number' && Number.isSafeInteger(value['version']) ? value['version'] : undefined;
    return {
      type: 'data-transfer-batch',
      ...(version === undefined ? {} : { version }),
      ...(summary === undefined ? {} : { summary }),
      ...(typeof value['undone'] === 'boolean' ? { undone: value['undone'] } : {}),
      ...(typeof value['synchronizationPending'] === 'boolean'
        ? { synchronizationPending: value['synchronizationPending'] }
        : {}),
      ...(typeof value['dataTransferBatchId'] === 'string'
        ? { dataTransferBatchId: value['dataTransferBatchId'] }
        : {}),
    };
  }
  if (typeof value['dataTransferBatchId'] === 'string') {
    return { dataTransferBatchId: value['dataTransferBatchId'] };
  }
  return value;
}

function safeTransferSummary(value: Prisma.JsonValue | undefined): Prisma.JsonObject | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const create = value['create'];
  const update = value['update'];
  const unchanged = value['unchanged'];
  const skip = value['skip'];
  if (
    typeof create !== 'number' ||
    !Number.isSafeInteger(create) ||
    create < 0 ||
    typeof update !== 'number' ||
    !Number.isSafeInteger(update) ||
    update < 0 ||
    typeof unchanged !== 'number' ||
    !Number.isSafeInteger(unchanged) ||
    unchanged < 0 ||
    typeof skip !== 'number' ||
    !Number.isSafeInteger(skip) ||
    skip < 0
  )
    return undefined;
  return { create, update, unchanged, skip };
}
