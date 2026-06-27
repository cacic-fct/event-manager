import { Prisma } from '@prisma/client';
import { getAuditFieldLabel } from './audit-log.field-labels';
import { StoredAuditChange } from './audit-log.types';

const IGNORED_AUDIT_FIELDS = new Set(['createdAt', 'updatedAt', 'updatedById']);

export function diffAuditRecords(before: Record<string, unknown>, after: Record<string, unknown>): StoredAuditChange[] {
  const changes: StoredAuditChange[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of [...keys].sort()) {
    if (IGNORED_AUDIT_FIELDS.has(key)) {
      continue;
    }

    const beforeValue = normalizeAuditValueForComparison(before[key]);
    const afterValue = normalizeAuditValueForComparison(after[key]);
    if (stableAuditStringify(beforeValue) === stableAuditStringify(afterValue)) {
      continue;
    }

    if (isPlainAuditRecord(beforeValue) && isPlainAuditRecord(afterValue)) {
      const childChanges = diffAuditRecords(beforeValue, afterValue).map((change) => ({
        ...change,
        field: `${key}.${change.field}`,
        label: `${getAuditFieldLabel(key)} · ${change.label}`,
      }));
      changes.push(...childChanges);
      continue;
    }

    changes.push({
      field: key,
      label: getAuditFieldLabel(key),
      before: beforeValue,
      after: afterValue,
    });
  }

  return changes;
}

export function normalizeAuditSnapshot(value: unknown): Record<string, unknown> {
  if (!isPlainAuditRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key, normalizeAuditValueForComparison(child)]),
  );
}

export function normalizeAuditValueForComparison(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeAuditValueForComparison(item));
  }

  if (isPlainAuditRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, normalizeAuditValueForComparison(child)]),
    );
  }

  return value ?? null;
}

export function readAuditSnapshot(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  return isPlainAuditRecord(value) ? value : null;
}

export function isPlainAuditRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date));
}

export function toNullableAuditJsonInput(value: Record<string, unknown>): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (Object.keys(value).length === 0) {
    return Prisma.JsonNull;
  }

  return toAuditJsonInput(value);
}

export function toAuditJsonInput(value: unknown): Prisma.InputJsonValue {
  return normalizeAuditValueForComparison(value) as Prisma.InputJsonValue;
}

export function parseAuditChanges(value: Prisma.JsonValue): StoredAuditChange[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isPlainAuditRecord(entry) || typeof entry['field'] !== 'string') {
      return [];
    }

    return [
      {
        field: entry['field'],
        label: typeof entry['label'] === 'string' ? entry['label'] : undefined,
        before: entry['before'],
        after: entry['after'],
      },
    ];
  });
}

export function formatAuditValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'boolean') {
    return value ? 'Sim' : 'Não';
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? '[]' : value.map((item) => formatAuditValue(item) ?? 'vazio').join(', ');
  }

  return JSON.stringify(value);
}

function stableAuditStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableAuditStringify(item)).join(',')}]`;
  }

  if (isPlainAuditRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableAuditStringify(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}
