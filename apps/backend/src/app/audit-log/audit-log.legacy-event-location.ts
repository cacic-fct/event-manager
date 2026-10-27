import { AuditLogEntityType, type AuditLogEntry } from '@prisma/client';
import { readAuditSnapshot } from './audit-log.snapshots';

type LocationAuditEntry = Pick<AuditLogEntry, 'entityType' | 'changedFields' | 'before' | 'metadata'>;

/** The migration marks old snapshots so new description-only edits stay unambiguous. */
export function legacyEventLocationBefore(entry: LocationAuditEntry): Record<string, unknown> | undefined {
  if (
    entry.entityType !== AuditLogEntityType.EVENT ||
    !entry.changedFields.includes('locationDescription') ||
    readAuditSnapshot(entry.metadata)?.['eventLocationFormat'] !== 'legacy-combined'
  ) {
    return undefined;
  }

  const description = readAuditSnapshot(entry.before)?.['locationDescription'];
  if (description != null && typeof description !== 'string') {
    return undefined;
  }
  if (description?.trim() === 'Evento on-line') {
    return { locationName: null, locationDescription: null, isVirtual: true, latitude: null, longitude: null };
  }

  const separator = description?.indexOf(' - ') ?? -1;
  return {
    locationName: (separator < 0 ? description : description?.slice(0, separator))?.trim() || null,
    locationDescription: separator < 0 ? null : description?.slice(separator + 3).trim() || null,
    isVirtual: false,
  };
}
