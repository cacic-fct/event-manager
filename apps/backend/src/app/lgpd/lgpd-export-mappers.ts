import { AuditLogEntityType } from '@prisma/client';
import {
  containsAuditIdentity,
  isEventAttendanceAuditEntityForPerson,
} from './lgpd-audit-anonymization';
import { parseScannerUserId } from './lgpd-offline-submissions';
import {
  DataSubjectResolution,
  LgpdAuditLogEntry,
  LgpdOfflineSubmission,
  LgpdResolvedPerson,
} from './lgpd-records';

export function mapPersonForExport(person: LgpdResolvedPerson) {
  return {
    id: person.id,
    name: person.name,
    email: person.email,
    secondaryEmails: person.secondaryEmails,
    phone: person.phone,
    identityDocument: person.identityDocument,
    isCPF: person.isCPF,
    academicId: person.academicId,
    userId: person.userId,
    externalRef: person.externalRef,
    mergedIntoId: person.mergedIntoId,
    mergedFromIds: person.mergedFrom.map((mergedPerson) => mergedPerson.id),
    deletedAt: person.deletedAt,
    createdAt: person.createdAt,
    updatedAt: person.updatedAt,
  };
}

export function selectManyForExport(records: readonly object[], select: object): Record<string, unknown>[] {
  return records.map((record) => selectForExport(record, select));
}

export function selectForExport(record: object, select: object): Record<string, unknown> {
  const source = record as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, selector] of Object.entries(select)) {
    if (selector === true) {
      result[key] = source[key];
      continue;
    }

    if (!hasNestedSelect(selector)) {
      continue;
    }

    const nestedValue = source[key];
    if (Array.isArray(nestedValue)) {
      result[key] = nestedValue
        .filter((value): value is Record<string, unknown> => isPlainRecord(value))
        .map((value) => selectForExport(value, selector.select));
      continue;
    }

    result[key] = isPlainRecord(nestedValue) ? selectForExport(nestedValue, selector.select) : nestedValue;
  }

  return result;
}

export function mapOfflineSubmissionForExport(
  submission: LgpdOfflineSubmission,
  dataSubject: DataSubjectResolution,
): Record<string, unknown> {
  const userIds = new Set(dataSubject.userIds);
  const emails = new Set(dataSubject.emails.map((email) => email.toLowerCase()));
  const scannerUserId = submission.scannerCode ? parseScannerUserId(submission.scannerCode) : null;
  const scannerMatchesSubject = scannerUserId == null || userIds.has(scannerUserId);
  const authorMatchesSubject =
    (submission.authorUserId != null && userIds.has(submission.authorUserId)) ||
    (submission.authorEmail != null && emails.has(submission.authorEmail.toLowerCase()));

  return {
    id: submission.id,
    clientId: submission.clientId,
    eventId: submission.eventId,
    personId: submission.personId,
    status: submission.status,
    createdByMethod: submission.createdByMethod,
    scannerCode: scannerMatchesSubject ? submission.scannerCode : null,
    manualValue: submission.manualValue,
    collectedAt: submission.collectedAt,
    authorUserId: authorMatchesSubject ? submission.authorUserId : null,
    authorName: authorMatchesSubject ? submission.authorName : null,
    authorEmail: authorMatchesSubject ? submission.authorEmail : null,
    submittedById: userIds.has(submission.submittedById) ? submission.submittedById : null,
    submittedBySubject: userIds.has(submission.submittedById),
    submittedAt: submission.submittedAt,
    stagedReason: submission.stagedReason,
    resolutionError: submission.resolutionError,
    collectedLatitude: submission.collectedLatitude,
    collectedLongitude: submission.collectedLongitude,
    collectedAccuracyMeters: submission.collectedAccuracyMeters,
    committedAt: submission.committedAt,
    committedById:
      submission.committedById != null && userIds.has(submission.committedById) ? submission.committedById : null,
    committedBySubject: submission.committedById != null && userIds.has(submission.committedById),
    rejectedAt: submission.rejectedAt,
    rejectedById:
      submission.rejectedById != null && userIds.has(submission.rejectedById) ? submission.rejectedById : null,
    rejectedBySubject: submission.rejectedById != null && userIds.has(submission.rejectedById),
    rejectionReason: submission.rejectionReason,
  };
}

export function mapAuditLogEntryForExport(
  entry: LgpdAuditLogEntry,
  dataSubject: DataSubjectResolution,
): Record<string, unknown> {
  const identityValues = new Set([...dataSubject.userIds, ...dataSubject.personIds]);
  const actorMatchesSubject = entry.actorId != null && dataSubject.userIds.includes(entry.actorId);
  const entityMatchesSubject =
    (entry.entityType === AuditLogEntityType.PERSON && dataSubject.personIds.includes(entry.entityId)) ||
    isEventAttendanceAuditEntityForPerson(entry.entityType, entry.entityId, dataSubject.personIds);
  const payloadMatchesSubject =
    containsAuditIdentity(entry.before, identityValues, entry.entityType === AuditLogEntityType.PERSON) ||
    containsAuditIdentity(entry.after, identityValues, entry.entityType === AuditLogEntityType.PERSON) ||
    containsAuditIdentity(entry.changes, identityValues, false) ||
    containsAuditIdentity(entry.metadata, identityValues, false);
  const revertedBySubject = entry.revertedById != null && dataSubject.userIds.includes(entry.revertedById);

  return {
    id: entry.id,
    entityType: entry.entityType,
    entityId: entityMatchesSubject ? entry.entityId : null,
    operation: entry.operation,
    actorId: actorMatchesSubject ? entry.actorId : null,
    actorType: actorMatchesSubject ? entry.actorType : null,
    actorMatchesSubject,
    entityMatchesSubject,
    payloadMatchesSubject,
    permission: entry.permission,
    changedFields: entityMatchesSubject || payloadMatchesSubject ? entry.changedFields : [],
    groupedCount: entry.groupedCount,
    firstRecordedAt: entry.firstRecordedAt,
    lastRecordedAt: entry.lastRecordedAt,
    createdAt: entry.createdAt,
    revertedAt: entry.revertedAt,
    revertedById: revertedBySubject ? entry.revertedById : null,
    revertedBySubject,
    revertedByEntryId: entry.revertedByEntryId,
    revertTargetId: entry.revertTargetId,
    revertMode: entry.revertMode,
  };
}

function hasNestedSelect(value: unknown): value is { select: object } {
  return isPlainRecord(value) && isPlainRecord(value['select']);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
