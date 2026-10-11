import { CertificateConfigRecord, CertificateRecord } from './certificate.constants';

/** Keeps the changed certificate configuration while excluding linked records and template source. */
export function toCertificateConfigAuditSnapshot(config: CertificateConfigRecord): Record<string, unknown> {
  return {
    id: config.id,
    createdById: config.createdById,
    name: config.name,
    scope: config.scope,
    majorEventId: config.majorEventId,
    eventGroupId: config.eventGroupId,
    eventId: config.eventId,
    folderId: config.folderId,
    certificateTemplateId: config.certificateTemplateId,
    certificateText: config.certificateText,
    shouldAutofillSecondPage: config.shouldAutofillSecondPage,
    secondPageText: config.secondPageText,
    isActive: config.isActive,
    issuedTo: config.issuedTo,
    certificateTypeLabel: config.certificateTypeLabel,
    paymentTiers: config.paymentTiers,
    attendeeEligibility: config.attendeeEligibility,
    certificateFields: config.certificateFields,
    deletedAt: config.deletedAt,
  };
}

/** Records issuance state and references without copying rendered certificate data or related profiles. */
export function toCertificateAuditSnapshot(certificate: CertificateRecord): Record<string, unknown> {
  return {
    id: certificate.id,
    personId: certificate.personId,
    configId: certificate.configId,
    certificateTemplateId: certificate.certificateTemplateId,
    issuedAt: certificate.issuedAt,
    issuedById: certificate.issuedById,
    deletedAt: certificate.deletedAt,
  };
}
