export interface EventCertificateSettings {
  shouldIssueCertificate?: boolean;
  shouldIssueCertificateForNonPayingAttendees?: boolean;
  shouldIssueCertificateForNonSubscribedAttendees?: boolean;
}

/** The event editor and JSON imports enforce the same parent certificate policy. */
export function normalizeEventCertificateSettings<T extends EventCertificateSettings>(
  input: T,
  group?: EventCertificateSettings | null,
): T {
  const normalized = { ...input };
  if (input.shouldIssueCertificate === false || (group && !group.shouldIssueCertificate)) {
    normalized.shouldIssueCertificateForNonPayingAttendees = false;
    normalized.shouldIssueCertificateForNonSubscribedAttendees = false;
  }
  if (group) {
    if (!group.shouldIssueCertificate) normalized.shouldIssueCertificate = false;
    if (!group.shouldIssueCertificateForNonPayingAttendees)
      normalized.shouldIssueCertificateForNonPayingAttendees = false;
    if (!group.shouldIssueCertificateForNonSubscribedAttendees)
      normalized.shouldIssueCertificateForNonSubscribedAttendees = false;
  }
  return normalized;
}
