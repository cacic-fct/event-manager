import { isPlainAuditRecord } from '../audit-log/audit-log.snapshots';

const RELATED_CONTENT_FIELDS = new Set([
  'majorEvent',
  'eventGroup',
  'sportsMatch',
  'sportsTournament',
  'attendances',
  'lecturers',
  'attendanceCollectors',
  'audienceInvitations',
  'createdAt',
  'updatedAt',
  'createdById',
  'updatedById',
]);

/** Audit content settings and relationship identifiers, without copying related records. */
export function eventContentAuditSnapshot(record: object): Record<string, unknown> {
  const snapshot = Object.fromEntries(Object.entries(record).filter(([field]) => !RELATED_CONTENT_FIELDS.has(field)));
  const relations = [
    ['lecturers', 'lecturerPersonIds'],
    ['attendanceCollectors', 'attendanceCollectorPersonIds'],
    ['audienceInvitations', 'invitationPersonIds'],
  ] as const;

  for (const [relation, field] of relations) {
    const value: unknown = Reflect.get(record, relation);
    if (Array.isArray(value) && !(field in snapshot)) {
      snapshot[field] = [...new Set(value.flatMap((item: unknown) =>
        isPlainAuditRecord(item) && typeof item['personId'] === 'string' ? [item['personId']] : [],
      ))].sort();
    }
  }
  return snapshot;
}
