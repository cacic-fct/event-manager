import type { CertificateIssuedTo, CertificateScope, DateTimeString, EventType } from './common';

export type CertificateParticipationStatus =
  | 'AWAITING_RELEASE'
  | 'ATTENDANCE_CONFIRMED'
  | 'PARTICIPATION_PENDING'
  | 'ATTENDANCE_UNCONFIRMED'
  | 'GROUP_ATTENDANCE_INCOMPLETE'
  | 'ATTENDANCE_UNDER_REVIEW'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_UNDER_REVIEW'
  | 'REGISTRATION_PENDING'
  | 'RULES_UNDER_REVIEW'
  | 'NOT_OFFERED';

export interface CertificateParticipationSummary {
  status: CertificateParticipationStatus;
  actionTargetId?: string | null;
}

export interface CertificateDownload {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface CertificateArchiveManifestEntry {
  certificateId: string;
  issuedAt: DateTimeString;
  fileName: string;
  sha256: string;
}

export interface CertificateArchiveManifest {
  format: 'cacic-certificates';
  schemaVersion: 2;
  generatedAt: DateTimeString;
  certificates: CertificateArchiveManifestEntry[];
}

export interface PublicCertificateValidationEvent {
  name: string;
  id: string;
  emoji: string;
  startDate: DateTimeString;
  endDate: DateTimeString;
  creditMinutes?: number | null;
}

export interface PublicCertificateValidationEventSection {
  title: string;
  type?: EventType | null;
  creditMinutes: number;
  events: PublicCertificateValidationEvent[];
}

export interface PublicCertificateValidation {
  id: string;
  issuedAt: DateTimeString;
  personName: string;
  maskedIdentityDocument?: string | null;
  scope: CertificateScope;
  certificateName: string;
  issuedTo: CertificateIssuedTo;
  certificateTypeLabel?: string | null;
  certificateText?: string | null;
  shouldAutofillSecondPage: boolean;
  secondPageText?: string | null;
  targetName?: string | null;
  targetEmoji?: string | null;
  sections: PublicCertificateValidationEventSection[];
  totalCreditMinutes: number;
}
