export type EventType = 'MINICURSO' | 'PALESTRA' | 'OTHER';
export type ContactType = 'EMAIL' | 'PHONE' | 'WHATSAPP' | 'OTHER';
export type AttendanceCreationMethod =
  | 'CSV_IMPORT'
  | 'MANUAL_INPUT'
  | 'SCANNER'
  | 'ONLINE_CODE'
  | 'UNKNOWN';
export type CertificateScope =
  | 'MAJOR_EVENT'
  | 'EVENT_GROUP'
  | 'EVENT'
  | 'OTHER';
export type CertificateIssuedTo = 'ATTENDEE' | 'LECTURER' | 'OTHER';
export type MergeCandidateStatus = 'PENDING' | 'MERGED' | 'REJECTED';
export type MergeMatchMethod = 'CPF' | 'EMAIL' | 'NORMALIZED_NAME';
export type AttendanceImportMatchType =
  | 'IDENTITY_DOCUMENT'
  | 'EMAIL'
  | 'FULL_NAME';
export type SubscriptionStatus =
  | 'WAITING_RECEIPT_UPLOAD'
  | 'RECEIPT_UNDER_REVIEW'
  | 'REJECTED_INVALID_RECEIPT'
  | 'REJECTED_NO_SLOTS'
  | 'REJECTED_SCHEDULE_CONFLICT'
  | 'REJECTED_GENERIC'
  | 'CONFIRMED'
  | 'CANCELED';
export type PersonMergeField =
  | 'NAME'
  | 'EMAIL'
  | 'IDENTITY_DOCUMENT'
  | 'ACADEMIC_ID'
  | 'USER_ID'
  | 'EXTERNAL_REF';

export interface MajorEvent {
  id: string;
  name: string;
  emoji: string;
  startDate: string;
  endDate: string;
  description?: string | null;
  subscriptionStartDate?: string | null;
  subscriptionEndDate?: string | null;
  maxCoursesPerAttendee?: number | null;
  maxLecturesPerAttendee?: number | null;
  buttonText?: string | null;
  buttonLink?: string | null;
  contactInfo?: string | null;
  contactType?: ContactType | null;
  isPaymentRequired: boolean;
  additionalPaymentInfo?: string | null;
  paymentInfo?: PaymentInfo | null;
  deletedAt?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

export interface PaymentInfo {
  id: string;
  bankName: string;
  agency: string;
  account: string;
  holder: string;
  document: string;
  majorEventId: string;
}

export interface EventGroup {
  id: string;
  name: string;
  emoji: string;
  shouldIssueCertificate: boolean;
  shouldIssueCertificateForEachEvent: boolean;
  shouldIssuePartialCertificate: boolean;
  deletedAt?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

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
  certificateTemplateId: string;
  certificateTemplate: CertificateTemplate;
  certificateText?: string | null;
  isActive: boolean;
  issuedTo: CertificateIssuedTo;
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

export interface Event {
  id: string;
  name: string;
  creditMinutes?: number | null;
  startDate: string;
  endDate: string;
  emoji: string;
  type: EventType;
  description?: string | null;
  shortDescription?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationDescription?: string | null;
  majorEventId?: string | null;
  majorEvent?: MajorEvent | null;
  eventGroupId?: string | null;
  eventGroup?: EventGroup | null;
  allowSubscription: boolean;
  subscriptionStartDate?: string | null;
  subscriptionEndDate?: string | null;
  slots?: number | null;
  autoSubscribe: boolean;
  shouldIssueCertificate: boolean;
  shouldCollectAttendance: boolean;
  isOnlineAttendanceAllowed: boolean;
  onlineAttendanceCode?: string | null;
  onlineAttendanceStartDate?: string | null;
  onlineAttendanceEndDate?: string | null;
  publiclyVisible: boolean;
  youtubeCode?: string | null;
  buttonText?: string | null;
  buttonLink?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

export interface User {
  id: string;
  email: string;
  name: string;
  identityDocument?: string | null;
  academicId?: string | null;
  role: string;
}

export interface Person {
  id: string;
  name: string;
  email?: string | null;
  secondaryEmails?: string[] | null;
  phone?: string | null;
  identityDocument?: string | null;
  academicId?: string | null;
  userId?: string | null;
  user?: User | null;
  mergedIntoId?: string | null;
  externalRef?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

export interface EventAttendance {
  personId: string;
  eventId: string;
  person?: Person | null;
  event?: Event | null;
  attendedAt: string;
  createdAt: string;
  createdById?: string | null;
  createdByMethod: AttendanceCreationMethod;
}

export interface MajorEventEventAttendanceStatus {
  eventId: string;
  eventName: string;
  eventStartDate?: string | null;
  attended: boolean;
  attendedAt?: string | null;
}

export interface MajorEventUserAttendance {
  majorEventId: string;
  subscriptionId: string;
  personId: string;
  person?: Person | null;
  subscriptionStatus: string;
  amountPaid?: number | null;
  paymentDate?: string | null;
  paymentTier?: string | null;
  attendances: MajorEventEventAttendanceStatus[];
}

export interface EventAttendanceCsvImportResult {
  createdCount: number;
  duplicateCount: number;
  failedCount: number;
  failedValues: string[];
  inferredMatchType: AttendanceImportMatchType;
}

export interface MajorEventSubscriptionCsvColumnMapping {
  emailHeader?: string | null;
  fullNameHeader?: string | null;
  enrollmentNumberHeader?: string | null;
  identityDocumentHeader?: string | null;
  subscribedEventIdsHeader: string;
}

export interface MajorEventSubscriptionCsvImportResult {
  createdSubscriptionCount: number;
  updatedSubscriptionCount: number;
  duplicateCount: number;
  createdPeopleCount: number;
  failedCount: number;
  createdPeople: Person[];
  failedRows: string[];
}

export interface EventLecturer {
  eventId: string;
  personId: string;
  event?: Event | null;
  person?: Person | null;
  createdAt: string;
  createdById?: string | null;
}

export interface MergeCandidate {
  id: string;
  personAId: string;
  personBId: string;
  personA?: Person | null;
  personB?: Person | null;
  pairKey: string;
  score?: number | null;
  matchMethod?: MergeMatchMethod | null;
  matchValue?: string | null;
  status: MergeCandidateStatus;
  resolvedById?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

export interface DeletionResult {
  deleted: boolean;
  id?: string | null;
  personId?: string | null;
  eventId?: string | null;
}

export interface MajorEventInput {
  id?: string;
  name?: string;
  emoji?: string;
  startDate?: string;
  endDate?: string;
  description?: string | null;
  subscriptionStartDate?: string | null;
  subscriptionEndDate?: string | null;
  maxCoursesPerAttendee?: number | null;
  maxLecturesPerAttendee?: number | null;
  buttonText?: string | null;
  buttonLink?: string | null;
  contactInfo?: string | null;
  contactType?: ContactType | null;
  isPaymentRequired?: boolean;
  additionalPaymentInfo?: string | null;
  paymentInfo?: PaymentInfoInput | null;
  deletedAt?: string | null;
  createdAt?: string;
  createdById?: string;
  updatedById?: string;
}

export interface PaymentInfoInput {
  bankName: string;
  agency: string;
  account: string;
  holder: string;
  document: string;
}

export interface EventGroupInput {
  id?: string;
  name?: string;
  emoji?: string;
  shouldIssueCertificate?: boolean;
  shouldIssueCertificateForEachEvent?: boolean;
  shouldIssuePartialCertificate?: boolean;
  deletedAt?: string | null;
  createdAt?: string;
  createdById?: string;
  updatedById?: string;
}

export interface CertificateConfigInput {
  name?: string;
  scope?: CertificateScope;
  majorEventId?: string | null;
  eventGroupId?: string | null;
  eventId?: string | null;
  certificateTemplateId?: string;
  certificateText?: string | null;
  isActive?: boolean;
  issuedTo?: CertificateIssuedTo;
  certificateFieldsJson?: string | null;
}

export interface EventInput {
  id?: string;
  name?: string;
  creditMinutes?: number | null;
  startDate?: string;
  endDate?: string;
  emoji?: string;
  type?: EventType;
  description?: string | null;
  shortDescription?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationDescription?: string | null;
  majorEventId?: string | null;
  eventGroupId?: string | null;
  allowSubscription?: boolean;
  subscriptionStartDate?: string | null;
  subscriptionEndDate?: string | null;
  slots?: number | null;
  autoSubscribe?: boolean;
  shouldIssueCertificate?: boolean;
  shouldCollectAttendance?: boolean;
  isOnlineAttendanceAllowed?: boolean;
  onlineAttendanceCode?: string | null;
  onlineAttendanceStartDate?: string | null;
  onlineAttendanceEndDate?: string | null;
  publiclyVisible?: boolean;
  youtubeCode?: string | null;
  buttonText?: string | null;
  buttonLink?: string | null;
  deletedAt?: string | null;
  createdAt?: string;
  createdById?: string;
  updatedById?: string;
}

export interface PersonInput {
  id?: string;
  name?: string;
  email?: string | null;
  secondaryEmails?: string[] | null;
  phone?: string | null;
  identityDocument?: string | null;
  academicId?: string | null;
  userId?: string | null;
  mergedIntoId?: string | null;
  externalRef?: string | null;
  deletedAt?: string | null;
  createdAt?: string;
  createdById?: string;
  updatedById?: string;
}
