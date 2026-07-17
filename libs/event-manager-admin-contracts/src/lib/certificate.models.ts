import type { Event, EventGroup, MajorEvent } from './event.models';
import type { Person } from './people.models';

export type CertificateScope = 'MAJOR_EVENT' | 'EVENT_GROUP' | 'EVENT' | 'OTHER';
export type CertificateIssuedTo = 'ATTENDEE' | 'LECTURER' | 'OTHER';

export interface CertificateTemplate {
  id: string;
  name: string;
  description?: string | null;
  version: number;
  isActive: boolean;
  certificateFieldsJson?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
  deletedAt?: string | null;
}

export interface CertificateFolder {
  id: string;
  name: string;
  emoji: string;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
  deletedAt?: string | null;
}

export interface CertificateConfig {
  id: string;
  name: string;
  scope: CertificateScope;
  majorEventId?: string | null;
  majorEvent?: MajorEvent | null;
  eventGroupId?: string | null;
  eventGroup?: EventGroup | null;
  eventId?: string | null;
  event?: Event | null;
  folderId?: string | null;
  folder?: CertificateFolder | null;
  certificateTemplateId: string;
  certificateTemplate: CertificateTemplate;
  certificateText?: string | null;
  shouldAutofillSecondPage: boolean;
  secondPageText?: string | null;
  isActive: boolean;
  issuedTo: CertificateIssuedTo;
  certificateTypeLabel?: string | null;
  certificateFieldsJson?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
  deletedAt?: string | null;
}

export interface Certificate {
  id: string;
  personId: string;
  person: Person;
  configId: string;
  config: CertificateConfig;
  renderedDataJson: string;
  issuedAt: string;
  issuedById?: string | null;
  certificateTemplateId: string;
  certificateTemplate: CertificateTemplate;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface CertificateDownload {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface CertificateReissueResult {
  configCount: number;
  certificateCount: number;
}

export interface CertificateConfigInput {
  name?: string;
  scope?: CertificateScope;
  majorEventId?: string | null;
  eventGroupId?: string | null;
  eventId?: string | null;
  folderId?: string | null;
  certificateTemplateId?: string;
  certificateText?: string | null;
  shouldAutofillSecondPage?: boolean;
  secondPageText?: string | null;
  isActive?: boolean;
  issuedTo?: CertificateIssuedTo;
  certificateTypeLabel?: string | null;
  certificateFieldsJson?: string | null;
}

export interface CertificateConfigClonePartsInput {
  textContent?: boolean;
  recipientData?: boolean;
  activeState?: boolean;
  issuedPeople?: boolean;
}

export interface CertificateConfigCloneInput {
  name?: string;
  scope?: CertificateScope;
  majorEventId?: string | null;
  eventGroupId?: string | null;
  eventId?: string | null;
  folderId?: string | null;
  parts?: CertificateConfigClonePartsInput;
}

export interface CertificateFolderInput {
  name?: string;
  emoji?: string;
  reissueCertificates?: boolean;
}

export interface CertificateCsvImportCandidate {
  id: string;
  name: string;
}

export interface CertificateCsvImportAmbiguousValue {
  value: string;
  candidates: CertificateCsvImportCandidate[];
}

export interface CertificateCsvImportResolution {
  value: string;
  personId: string;
}

export interface CertificateCsvImportResult {
  createdCount: number;
  duplicateCount: number;
  failedCount: number;
  failedValues: string[];
  inferredMatchType: import('./attendance.models').AttendanceImportMatchType;
  ambiguousValues: CertificateCsvImportAmbiguousValue[];
}
