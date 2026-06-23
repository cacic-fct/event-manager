import type { CertificateScope, DateTimeString, EventType } from './common';

export interface CertificateDownload {
  fileName: string;
  mimeType: string;
  contentBase64: string;
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
  targetName?: string | null;
  targetEmoji?: string | null;
  sections: PublicCertificateValidationEventSection[];
  totalCreditMinutes: number;
}
