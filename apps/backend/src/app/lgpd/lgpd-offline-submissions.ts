import { Prisma } from '@prisma/client';
import { getBrazilianPhoneCandidates } from '../common/brazilian-phone';
import { parseStoredScannerUserId } from '../events/attendances/user-scanner-code';
import { ANONYMIZED_AUDIT_VALUE } from './lgpd-audit-anonymization';
import { DataSubjectResolution } from './lgpd-records';

export function buildOfflineSubmissionSubjectWhere(
  dataSubject: DataSubjectResolution,
): Prisma.OfflineEventAttendanceSubmissionWhereInput | null {
  const conditions: Prisma.OfflineEventAttendanceSubmissionWhereInput[] = [];
  if (dataSubject.personIds.length > 0) {
    conditions.push({ personId: { in: dataSubject.personIds } });
  }
  if (dataSubject.userIds.length > 0) {
    conditions.push({ authorUserId: { in: dataSubject.userIds } });
    conditions.push({ submittedById: { in: dataSubject.userIds } });
    conditions.push({ committedById: { in: dataSubject.userIds } });
    conditions.push({ rejectedById: { in: dataSubject.userIds } });
    conditions.push({ scannerCode: { in: scannerSubjectValues(dataSubject.userIds) } });
  }
  for (const email of dataSubject.emails) {
    conditions.push({ authorEmail: { equals: email, mode: 'insensitive' } });
  }
  const manualValues = getOfflineManualSubjectValueCandidates(dataSubject);
  if (manualValues.length > 0) {
    conditions.push({ manualValue: { in: manualValues, mode: 'insensitive' } });
  }

  return conditions.length > 0 ? { OR: conditions } : null;
}

export function parseScannerUserId(scannerCode: string): string | null {
  return parseStoredScannerUserId(scannerCode);
}

export function getOfflineManualSubjectValueCandidates(dataSubject: DataSubjectResolution): string[] {
  const values = new Map<string, string>();
  const addValue = (value?: string | null) => {
    const normalizedValue = value?.trim();
    if (!normalizedValue) {
      return;
    }
    values.set(caseInsensitiveKey(normalizedValue), normalizedValue);
  };

  for (const email of dataSubject.emails) {
    addValue(email);
  }

  for (const person of dataSubject.people) {
    addValue(person.email);
    for (const email of person.secondaryEmails ?? []) {
      addValue(email);
    }
    addPhoneManualValueCandidates(values, person.phone);
    addIdentityDocumentManualValueCandidates(values, person.identityDocument, person.isCPF !== false);
  }

  return [...values.values()];
}

export async function anonymizeOfflineAttendanceSubmissions(
  tx: Prisma.TransactionClient,
  dataSubject: DataSubjectResolution,
  anonymizedSubjectId: string,
): Promise<number> {
  const where = buildOfflineSubmissionSubjectWhere(dataSubject);
  if (!where) {
    return 0;
  }

  const submissions = await tx.offlineEventAttendanceSubmission.findMany({
    where,
    select: {
      id: true,
      personId: true,
      scannerCode: true,
      manualValue: true,
      authorUserId: true,
      authorName: true,
      authorEmail: true,
      submittedById: true,
      committedById: true,
      rejectedById: true,
    },
  });
  const userIds = new Set(dataSubject.userIds);
  const personIds = new Set(dataSubject.personIds);
  const emails = new Set(dataSubject.emails.map((email) => email.toLowerCase()));
  const manualValues = new Set(
    getOfflineManualSubjectValueCandidates(dataSubject).map((value) => caseInsensitiveKey(value)),
  );
  let updated = 0;

  for (const submission of submissions) {
    const data: Prisma.OfflineEventAttendanceSubmissionUncheckedUpdateInput = {};
    const personMatches = submission.personId != null && personIds.has(submission.personId);
    if (personMatches) {
      data.personId = null;
      data.scannerCode = ANONYMIZED_AUDIT_VALUE;
      data.manualValue = ANONYMIZED_AUDIT_VALUE;
    }
    if (submission.scannerCode && userIds.has(parseScannerUserId(submission.scannerCode) ?? '')) {
      data.scannerCode = anonymizedSubjectId;
    }
    if (submission.manualValue && manualValues.has(caseInsensitiveKey(submission.manualValue))) {
      data.manualValue = ANONYMIZED_AUDIT_VALUE;
    }
    if (submission.authorUserId && userIds.has(submission.authorUserId)) {
      data.authorUserId = anonymizedSubjectId;
    }
    if (submission.authorEmail && emails.has(submission.authorEmail.toLowerCase())) {
      data.authorEmail = null;
    }
    if (
      (submission.authorUserId && userIds.has(submission.authorUserId)) ||
      (submission.authorEmail && emails.has(submission.authorEmail.toLowerCase()))
    ) {
      data.authorName = ANONYMIZED_AUDIT_VALUE;
    }
    if (userIds.has(submission.submittedById)) {
      data.submittedById = anonymizedSubjectId;
    }
    if (submission.committedById && userIds.has(submission.committedById)) {
      data.committedById = anonymizedSubjectId;
    }
    if (submission.rejectedById && userIds.has(submission.rejectedById)) {
      data.rejectedById = anonymizedSubjectId;
    }
    if (Object.keys(data).length === 0) {
      continue;
    }

    await tx.offlineEventAttendanceSubmission.update({
      where: { id: submission.id },
      data,
    });
    updated += 1;
  }

  return updated;
}

export function caseInsensitiveKey(value: string): string {
  return value.trim().toLowerCase();
}

function scannerSubjectValues(userIds: readonly string[]): string[] {
  return [...new Set(userIds.flatMap((userId) => [userId, `user:${userId}`]))];
}

function addPhoneManualValueCandidates(values: Map<string, string>, phone?: string | null): void {
  const normalizedPhone = phone?.trim();
  if (!normalizedPhone) {
    return;
  }

  addManualValueCandidate(values, normalizedPhone);
  for (const candidate of getBrazilianPhoneCandidates(normalizedPhone)) {
    addManualValueCandidate(values, candidate);
  }
}

function addIdentityDocumentManualValueCandidates(
  values: Map<string, string>,
  identityDocument?: string | null,
  isCpf = true,
): void {
  const normalizedDocument = identityDocument?.trim();
  if (!normalizedDocument) {
    return;
  }

  addManualValueCandidate(values, normalizedDocument);
  const digits = normalizedDocument.replace(/\D/g, '');
  if (!digits) {
    return;
  }

  addManualValueCandidate(values, digits);
  if (isCpf && digits.length === 11) {
    addManualValueCandidate(
      values,
      `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`,
    );
  }
}

function addManualValueCandidate(values: Map<string, string>, value: string): void {
  const normalizedValue = value.trim();
  if (normalizedValue) {
    values.set(caseInsensitiveKey(normalizedValue), normalizedValue);
  }
}
