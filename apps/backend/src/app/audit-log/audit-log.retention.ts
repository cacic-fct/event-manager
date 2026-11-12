const AUDIT_LOG_RETENTION_YEARS = 5;

export function getAuditLogRetentionCutoff(now: Date): Date {
  const cutoff = new Date(now);
  const month = cutoff.getUTCMonth();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - AUDIT_LOG_RETENTION_YEARS);
  if (cutoff.getUTCMonth() !== month) {
    cutoff.setUTCDate(0);
  }
  // Typesense stores audit timestamps with second precision.
  cutoff.setUTCMilliseconds(0);
  return cutoff;
}
