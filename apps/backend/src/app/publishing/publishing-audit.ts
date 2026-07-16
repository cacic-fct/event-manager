const PUBLICATION_AUDIT_FIELDS = [
  'publicationState',
  'scheduledPublishAt',
  'publishedAt',
  'unpublishedAt',
  'publicationScheduledBy',
  'publicationUpdatedBy',
] as const;

/**
 * Keeps publication lifecycle bookkeeping out of content-edit audit entries.
 * Dedicated publication actions record their own audit entries.
 */
export function omitPublicationAuditFields<T extends Record<string, unknown>>(record: T): Omit<T, (typeof PUBLICATION_AUDIT_FIELDS)[number]> {
  const snapshot = { ...record };
  for (const field of PUBLICATION_AUDIT_FIELDS) {
    delete snapshot[field];
  }
  return snapshot;
}
