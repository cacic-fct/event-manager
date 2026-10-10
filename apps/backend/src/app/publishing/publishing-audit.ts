import { AuditLogMetadataCategory } from '../audit-log/audit-log.types';

const PUBLICATION_AUDIT_FIELDS = [
  'publicationState',
  'scheduledPublishAt',
  'publishedAt',
  'unpublishedAt',
  'publicationScheduledBy',
  'publicationUpdatedBy',
] as const;

const PUBLICATION_STATE_AUDIT_FIELDS = [
  'publicationState',
  'scheduledPublishAt',
  'publishedAt',
  'unpublishedAt',
  'publicationScheduledBy',
  'publicationUpdatedBy',
  'isPubliclyListed',
] as const;

export const PUBLICATION_LIFECYCLE_AUDIT_METADATA = {
  category: AuditLogMetadataCategory.PUBLICATION_LIFECYCLE,
} as const;

/**
 * Keeps publication lifecycle bookkeeping out of content-edit audit entries.
 * Dedicated publication actions record their own audit entries.
 */
export function omitPublicationAuditFields<T extends Record<string, unknown>>(
  record: T,
): Omit<T, (typeof PUBLICATION_AUDIT_FIELDS)[number]> {
  const snapshot = { ...record };
  for (const field of PUBLICATION_AUDIT_FIELDS) {
    delete snapshot[field];
  }
  return snapshot;
}

/** Captures only lifecycle fields so publication records do not duplicate content edits. */
export function pickPublicationAuditFields<T extends Record<string, unknown>>(
  record: T,
): Partial<Pick<T, Extract<keyof T, (typeof PUBLICATION_AUDIT_FIELDS)[number]>>> {
  return Object.fromEntries(
    PUBLICATION_AUDIT_FIELDS.filter((field) => field in record).map((field) => [field, record[field]]),
  ) as Partial<Pick<T, Extract<keyof T, (typeof PUBLICATION_AUDIT_FIELDS)[number]>>>;
}

/** Captures lifecycle state without copying the event tree or audience configuration. */
export function publicationStateAuditSnapshot(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    PUBLICATION_STATE_AUDIT_FIELDS.filter((field) => field in record).map((field) => [field, record[field]]),
  );
}
