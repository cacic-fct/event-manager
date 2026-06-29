import type { FormElement } from '@cacic-fct/form-contracts';

export type EventType = 'MINICURSO' | 'PALESTRA' | 'OTHER';
export type PublicationState = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'UNPUBLISHED';
export type PublicationTargetType = 'EVENT' | 'EVENT_GROUP' | 'MAJOR_EVENT';
export type EventFormSigilo = 'PUBLIC' | 'PARTIALLY_SECRET' | 'SECRET' | 'ANONYMOUS';
export type EventFormAudience = 'SUBSCRIBERS' | 'ATTENDEES' | 'SUBSCRIBERS_OR_ATTENDEES';
export type EventFormTargetType = 'EVENT' | 'MAJOR_EVENT';
export type EventFormResponseSource = 'PUBLIC_FORM' | 'SUBSCRIPTION_FLOW' | 'LECTURER_PUBLISH';
export type EventFormResponseMode = 'ONE_PER_TARGET' | 'MULTIPLE_PER_TARGET' | 'SINGLE_PER_FORM';
export type ContactType = 'EMAIL' | 'PHONE' | 'WHATSAPP' | 'OTHER';
export type PriceType = 'SINGLE' | 'TIERED';
export type AttendanceCreationMethod = 'CSV_IMPORT' | 'MANUAL_INPUT' | 'SCANNER' | 'ONLINE_CODE' | 'UNKNOWN';
export type CertificateScope = 'MAJOR_EVENT' | 'EVENT_GROUP' | 'EVENT' | 'OTHER';
export type CertificateIssuedTo = 'ATTENDEE' | 'LECTURER' | 'OTHER';
export type MergeCandidateStatus = 'PENDING' | 'MERGED' | 'REJECTED' | 'STALE';
export type MergeMatchMethod = 'CPF' | 'EMAIL' | 'NORMALIZED_NAME';
export type AttendanceImportMatchType = 'IDENTITY_DOCUMENT' | 'EMAIL' | 'FULL_NAME';
export type AttendanceCategory = 'NON_PAYING' | 'NON_SUBSCRIBED' | 'REGULAR' | 'UNKNOWN';
export type EventManagerPermissionGrantScope = 'GLOBAL' | 'EVENT' | 'MAJOR_EVENT' | 'EVENT_GROUP';
export type SubscriptionStatus =
  | 'WAITING_RECEIPT_UPLOAD'
  | 'RECEIPT_UNDER_REVIEW'
  | 'REJECTED_INVALID_RECEIPT'
  | 'REJECTED_NO_SLOTS'
  | 'REJECTED_SCHEDULE_CONFLICT'
  | 'REJECTED_GENERIC'
  | 'CONFIRMED'
  | 'CANCELED';
export type SubscriptionCreationMethod = 'ADMIN_DASHBOARD' | 'SELF_SUBSCRIPTION' | 'UNKNOWN';
export type PersonMergeField = 'NAME' | 'EMAIL' | 'IDENTITY_DOCUMENT' | 'ACADEMIC_ID' | 'USER_ID' | 'EXTERNAL_REF';
export type AuditLogEntityType =
  | 'PERSON'
  | 'LECTURER_PROFILE'
  | 'EVENT'
  | 'MAJOR_EVENT'
  | 'EVENT_GROUP'
  | 'PLACE_PRESET'
  | 'PERMISSION_GRANT'
  | 'EVENT_SUBSCRIPTION'
  | 'EVENT_GROUP_SUBSCRIPTION'
  | 'MAJOR_EVENT_SUBSCRIPTION'
  | 'EVENT_ATTENDANCE'
  | 'EVENT_ATTENDANCE_COLLECTOR'
  | 'EVENT_LECTURER'
  | 'CERTIFICATE_CONFIG'
  | 'CERTIFICATE'
  | 'MERGE_CANDIDATE'
  | 'RECEIPT_VALIDATION'
  | 'SYSTEM';
export type AuditLogOperation =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'MERGE'
  | 'IMPORT'
  | 'APPROVE'
  | 'REJECT'
  | 'ISSUE'
  | 'REISSUE'
  | 'SCAN'
  | 'UNDO'
  | 'REVERT'
  | 'USER_CREATE';
export type AuditLogActorType = 'USER' | 'SERVICE' | 'SYSTEM';
export type AuditLogRevertMode = 'ENTRY_ONLY' | 'ENTRY_AND_AFTER';
export type AuditLogExplorerRevertedStatus = 'ALL' | 'REVERTED' | 'NOT_REVERTED';

export interface AuditLogChange {
  field: string;
  label: string;
  beforeValue?: string | null;
  afterValue?: string | null;
}

export interface AuditLogEntry {
  id: string;
  entityType: AuditLogEntityType;
  entityId: string;
  entityLabel?: string | null;
  operation: AuditLogOperation;
  summary?: string | null;
  actorId?: string | null;
  actorName: string;
  actorEmail?: string | null;
  actorType: AuditLogActorType;
  permission?: string | null;
  eventId?: string | null;
  majorEventId?: string | null;
  eventGroupId?: string | null;
  changes: AuditLogChange[];
  changedFields: string[];
  groupedCount: number;
  firstRecordedAt: string;
  lastRecordedAt: string;
  createdAt: string;
  revertedAt?: string | null;
  revertedById?: string | null;
  revertedByName?: string | null;
  revertedByEntryId?: string | null;
  revertTargetId?: string | null;
  revertMode?: AuditLogRevertMode | null;
  canRevert: boolean;
}

export interface AuditLogExplorerEntry extends AuditLogEntry {
  beforeJson?: string | null;
  afterJson?: string | null;
  metadataJson?: string | null;
}

export interface AuditLogExplorerResult {
  entries: AuditLogExplorerEntry[];
  total: number;
  skip: number;
  take: number;
  typesenseAvailable: boolean;
}

export interface EventSummary {
  id: string;
  eventGroupId: string | null;
  startDate: string;
  endDate: string;
  createdAt: string;
  name: string;
  majorEvent?: Pick<MajorEvent, 'id' | 'name'> | null;
}

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
  maxUncategorizedPerAttendee?: number | null;
  rankedSubscriptionEnabled?: boolean | null;
  buttonText?: string | null;
  buttonLink?: string | null;
  contactInfo?: string | null;
  contactType?: ContactType | null;
  isPaymentRequired: boolean;
  shouldIssueCertificateForNonPayingAttendees: boolean;
  shouldIssueCertificateForNonSubscribedAttendees: boolean;
  additionalPaymentInfo?: string | null;
  paymentInfo?: PaymentInfo | null;
  majorEventPrices: MajorEventPrice[];
  publicationState: PublicationState;
  scheduledPublishAt?: string | null;
  publishedAt?: string | null;
  unpublishedAt?: string | null;
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
  pixKey?: string | null;
  pixCity?: string | null;
  majorEventId: string;
}

export interface MajorEventPriceTier {
  id: string;
  name: string;
  value: number;
}

export interface MajorEventPrice {
  id: string;
  type: PriceType;
  tiers: MajorEventPriceTier[];
}

export interface EventGroup {
  id: string;
  name: string;
  emoji: string;
  shouldIssueCertificate: boolean;
  shouldIssueCertificateForNonPayingAttendees: boolean;
  shouldIssueCertificateForNonSubscribedAttendees: boolean;
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
  shouldAutofillSecondPage: boolean;
  secondPageText?: string | null;
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

export interface CertificateReissueResult {
  configCount: number;
  certificateCount: number;
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
  shouldIssueCertificateForNonPayingAttendees: boolean;
  shouldIssueCertificateForNonSubscribedAttendees: boolean;
  shouldCollectAttendance: boolean;
  isOnlineAttendanceAllowed: boolean;
  shouldProvideSubscriberListToLecturer?: boolean;
  onlineAttendanceCode?: string | null;
  onlineAttendanceStartDate?: string | null;
  onlineAttendanceEndDate?: string | null;
  publiclyVisible: boolean;
  publicationState: PublicationState;
  scheduledPublishAt?: string | null;
  publishedAt?: string | null;
  unpublishedAt?: string | null;
  youtubeCode?: string | null;
  buttonText?: string | null;
  buttonLink?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

export interface EventDraft {
  id: string;
  sourceEventId: string;
  name: string;
  payloadJson: string;
  createdById?: string | null;
  createdByName?: string | null;
  createdByEmail?: string | null;
  updatedById?: string | null;
  updatedByName?: string | null;
  updatedByEmail?: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface EventFormTargetSummary {
  type: EventFormTargetType;
  id: string;
  name: string;
  emoji?: string | null;
}

export interface EventFormLink {
  id: string;
  formId: string;
  targetType: EventFormTargetType;
  eventId?: string | null;
  majorEventId?: string | null;
  target?: EventFormTargetSummary | null;
  audience: EventFormAudience;
  insertInSubscriptionFlow: boolean;
  requiredInSubscriptionFlow: boolean;
  enforceRequiredAnswers: boolean;
  displayOrder: number;
  availableFrom?: string | null;
  availableUntil?: string | null;
  notifyOnPublish: boolean;
  allowLecturerManualPublish: boolean;
  lastNotifiedAt?: string | null;
  responseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface EventForm {
  id: string;
  name: string;
  description?: string | null;
  ownerEventId?: string | null;
  ownerMajorEventId?: string | null;
  owner?: EventFormTargetSummary | null;
  elementsJson: string;
  sigilo: EventFormSigilo;
  responseMode: EventFormResponseMode;
  resultsPublic: boolean;
  resultsLive: boolean;
  publicationState: PublicationState;
  scheduledPublishAt?: string | null;
  publishedAt?: string | null;
  unpublishedAt?: string | null;
  links: EventFormLink[];
  responseCount: number;
  deletedAt?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

export interface EventFormDraft {
  id: string;
  sourceFormId: string;
  name: string;
  payloadJson: string;
  createdById?: string | null;
  createdByName?: string | null;
  createdByEmail?: string | null;
  updatedById?: string | null;
  updatedByName?: string | null;
  updatedByEmail?: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface EventFormResponse {
  id: string;
  formId: string;
  linkId?: string | null;
  targetType: EventFormTargetType;
  eventId?: string | null;
  majorEventId?: string | null;
  personId?: string | null;
  respondentName?: string | null;
  respondentEmail?: string | null;
  answersJson: string;
  source: EventFormResponseSource;
  submittedAt?: string | null;
  updatedAt: string;
}

export interface EventFormResults {
  form: EventForm;
  responseCount: number;
  anonymous: boolean;
  answersReleased: boolean;
  summaryJson: string;
  responses: EventFormResponse[];
}

export interface PlacePreset {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  locationDescription?: string | null;
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
  lecturerProfile?: LecturerProfile | null;
}

export interface PersonLinkedResource {
  id: string;
  label: string;
  description?: string | null;
  route?: string | null;
  status?: string | null;
  occurredAt?: string | null;
}

export interface PersonLinkedResourceGroup {
  type: string;
  label: string;
  icon: string;
  items?: PersonLinkedResource[];
  totalCount: number;
}

export interface PersonLinkedDataSummary {
  personId: string;
  groups: PersonLinkedResourceGroup[];
  totalCount: number;
  hasLinkedData: boolean;
  canDelete: boolean;
}

export interface PersonLinkedResourcePage {
  personId: string;
  type: string;
  label: string;
  icon: string;
  items: PersonLinkedResource[];
  total: number;
  skip: number;
  take: number;
}

export interface EventManagerPermissionGrant {
  id: string;
  userId: string;
  personId?: string | null;
  permission: string;
  scope: EventManagerPermissionGrantScope;
  eventId?: string | null;
  majorEventId?: string | null;
  eventGroupId?: string | null;
  targetLabel?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

export interface EventManagerPermissionGrantTarget {
  id: string;
  label: string;
  description?: string | null;
  emoji?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface EventManagerPermissionGrantInput {
  userId: string;
  personId?: string | null;
  permission: string;
  scope: EventManagerPermissionGrantScope;
  eventId?: string | null;
  majorEventId?: string | null;
  eventGroupId?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
}

export interface EventManagerPermissionGrantUpdateInput {
  permission: string;
  scope: EventManagerPermissionGrantScope;
  eventId?: string | null;
  majorEventId?: string | null;
  eventGroupId?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
}

export interface LecturerProfile {
  id: string;
  personId: string;
  displayName: string;
  biography?: string | null;
  publishGoogleUserPicture: boolean;
  googleUserPicture?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  createdAt: string;
  createdById?: string | null;
  updatedAt: string;
  updatedById?: string | null;
}

export interface LecturerProfileInput {
  displayName: string;
  biography?: string | null;
  publishGoogleUserPicture?: boolean;
  email?: string | null;
  whatsapp?: string | null;
}

export interface EventAttendance {
  personId: string;
  eventId: string;
  person?: Person | null;
  event?: Event | null;
  category: AttendanceCategory;
  attendedAt: string;
  createdAt: string;
  createdById?: string | null;
  committedById?: string | null;
  createdByMethod: AttendanceCreationMethod;
  collectedByFullName?: string | null;
  committedByFullName?: string | null;
  collectedLatitude?: number | null;
  collectedLongitude?: number | null;
  collectedAccuracyMeters?: number | null;
}

export type OfflineEventAttendanceSubmissionStatus = 'PENDING' | 'COMMITTED' | 'REJECTED';

export interface OfflineEventAttendanceSubmission {
  id: string;
  clientId: string;
  eventId: string;
  event?: Event | null;
  personId?: string | null;
  person?: Person | null;
  status: OfflineEventAttendanceSubmissionStatus;
  createdByMethod: AttendanceCreationMethod;
  scannerCode?: string | null;
  manualValue?: string | null;
  collectedAt: string;
  authorUserId?: string | null;
  authorName?: string | null;
  authorEmail?: string | null;
  submittedById: string;
  submittedByFullName?: string | null;
  submittedAt: string;
  stagedReason?: string | null;
  resolutionError?: string | null;
  collectedLatitude?: number | null;
  collectedLongitude?: number | null;
  collectedAccuracyMeters?: number | null;
  committedAt?: string | null;
  committedById?: string | null;
  committedByFullName?: string | null;
  rejectedAt?: string | null;
  rejectedById?: string | null;
  rejectedByFullName?: string | null;
  rejectionReason?: string | null;
}

export interface EventAttendanceCollector {
  eventId: string;
  personId: string;
  event?: Event | null;
  person?: Person | null;
  createdAt: string;
  createdById?: string | null;
}

export interface EventAttendanceScannerFeedItem {
  personId: string;
  eventId: string;
  fullName?: string | null;
  unespRole?: string | null;
  subscriptionStatus?: SubscriptionStatus | null;
  attendedAt?: string | null;
  createdByMethod?: AttendanceCreationMethod | null;
  collectedByFirstName?: string | null;
}

export interface MajorEventEventAttendanceStatus {
  eventId: string;
  eventName: string;
  eventStartDate?: string | null;
  attended: boolean;
  attendedAt?: string | null;
  category: AttendanceCategory;
}

export interface MajorEventUserAttendance {
  majorEventId: string;
  subscriptionId?: string | null;
  personId: string;
  person?: Person | null;
  subscriptionStatus: string;
  amountPaid?: number | null;
  paymentDate?: string | null;
  paymentTier?: string | null;
  attendances: MajorEventEventAttendanceStatus[];
}

export interface WorkspaceEventSubscription {
  id: string;
  eventId: string;
  event?: Event | null;
  personId: string;
  person?: Person | null;
  eventGroupSubscriptionId?: string | null;
  majorEventSubscriptionId?: string | null;
  createdAt: string;
  createdById?: string | null;
  createdByMethod: SubscriptionCreationMethod;
  isLecturerSubscription: boolean;
}

export interface WorkspaceMajorEventSubscriptionEvent {
  eventId: string;
  eventName: string;
  eventStartDate?: string | null;
  subscribed: boolean;
  isLecturerSubscription: boolean;
}

export interface WorkspaceMajorEventSubscription {
  id: string;
  majorEventId: string;
  majorEvent?: MajorEvent | null;
  personId: string;
  person?: Person | null;
  subscriptionStatus: SubscriptionStatus;
  amountPaid?: number | null;
  paymentDate?: string | null;
  paymentTier?: string | null;
  createdAt: string;
  createdById?: string | null;
  createdByMethod: SubscriptionCreationMethod;
  events: WorkspaceMajorEventSubscriptionEvent[];
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
  maxUncategorizedPerAttendee?: number | null;
  rankedSubscriptionEnabled?: boolean | null;
  buttonText?: string | null;
  buttonLink?: string | null;
  contactInfo?: string | null;
  contactType?: ContactType | null;
  isPaymentRequired?: boolean;
  shouldIssueCertificateForNonPayingAttendees?: boolean;
  shouldIssueCertificateForNonSubscribedAttendees?: boolean;
  additionalPaymentInfo?: string | null;
  paymentInfo?: PaymentInfoInput | null;
  price?: MajorEventPriceInput | null;
}

export interface MajorEventClonePartsInput {
  certificateConfig?: boolean;
  subscriptionSettings?: boolean;
  paymentSettings?: boolean;
}

export interface MajorEventCloneInput {
  name?: string;
  parts?: MajorEventClonePartsInput;
}

export interface PaymentInfoInput {
  bankName: string;
  agency: string;
  account: string;
  holder: string;
  document: string;
  pixKey?: string;
  pixCity?: string;
}

export interface PriceTierInput {
  id?: string;
  name: string;
  value: number;
}

export interface MajorEventPriceInput {
  type: PriceType;
  tiers: PriceTierInput[];
}

export interface EventGroupInput {
  id?: string;
  name?: string;
  emoji?: string;
  shouldIssueCertificate?: boolean;
  shouldIssueCertificateForNonPayingAttendees?: boolean;
  shouldIssueCertificateForNonSubscribedAttendees?: boolean;
  shouldIssueCertificateForEachEvent?: boolean;
  shouldIssuePartialCertificate?: boolean;
}

export interface EventGroupClonePartsInput {
  certificateConfig?: boolean;
}

export interface EventGroupCloneInput {
  name?: string;
  parts?: EventGroupClonePartsInput;
}

export interface CertificateConfigInput {
  name?: string;
  scope?: CertificateScope;
  majorEventId?: string | null;
  eventGroupId?: string | null;
  eventId?: string | null;
  certificateTemplateId?: string;
  certificateText?: string | null;
  shouldAutofillSecondPage?: boolean;
  secondPageText?: string | null;
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
  shouldIssueCertificateForNonPayingAttendees?: boolean;
  shouldIssueCertificateForNonSubscribedAttendees?: boolean;
  shouldCollectAttendance?: boolean;
  isOnlineAttendanceAllowed?: boolean;
  shouldProvideSubscriberListToLecturer?: boolean;
  onlineAttendanceCode?: string | null;
  onlineAttendanceStartDate?: string | null;
  onlineAttendanceEndDate?: string | null;
  publiclyVisible?: boolean;
  youtubeCode?: string | null;
  buttonText?: string | null;
  buttonLink?: string | null;
  lecturerPersonIds?: string[] | null;
  attendanceCollectorPersonIds?: string[] | null;
}

export interface EventClonePartsInput {
  lecturers?: boolean;
  certificateConfig?: boolean;
  subscriptionSettings?: boolean;
  attendanceSettings?: boolean;
  place?: boolean;
  visibility?: boolean;
}

export interface EventCloneInput {
  name?: string;
  parts?: EventClonePartsInput;
}

interface EventFormLinkInputBase {
  id?: string | null;
  audience?: EventFormAudience | null;
  insertInSubscriptionFlow?: boolean | null;
  requiredInSubscriptionFlow?: boolean | null;
  enforceRequiredAnswers?: boolean | null;
  displayOrder?: number | null;
  availableFrom?: string | null;
  availableUntil?: string | null;
  notifyOnPublish?: boolean | null;
  allowLecturerManualPublish?: boolean | null;
}

export type EventFormLinkInput =
  | (EventFormLinkInputBase & {
      targetType: 'EVENT';
      eventId: string;
      majorEventId?: null;
    })
  | (EventFormLinkInputBase & {
      targetType: 'MAJOR_EVENT';
      eventId?: null;
      majorEventId: string;
    });

interface EventFormInputBase {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  elementsJson?: string | null;
  sigilo?: EventFormSigilo | null;
  responseMode?: EventFormResponseMode | null;
  resultsPublic?: boolean | null;
  resultsLive?: boolean | null;
  links?: EventFormLinkInput[] | null;
}

export type EventFormInput =
  | (EventFormInputBase & {
      ownerEventId: string;
      ownerMajorEventId?: null;
    })
  | (EventFormInputBase & {
      ownerEventId?: null;
      ownerMajorEventId: string;
    });

interface SubmitEventFormResponseBaseInput {
  formId: string;
  linkId?: string | null;
  answersJson: string;
}

export type SubmitEventFormResponseInput =
  | (SubmitEventFormResponseBaseInput & {
      targetType: 'EVENT';
      eventId: string;
      majorEventId?: null;
    })
  | (SubmitEventFormResponseBaseInput & {
      targetType: 'MAJOR_EVENT';
      eventId?: null;
      majorEventId: string;
    });

export function parseFormElementsJson(value: string | null | undefined): FormElement[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as FormElement[]) : [];
  } catch {
    return [];
  }
}

export function serializeFormElements(elements: readonly FormElement[]): string {
  return JSON.stringify(elements);
}

export interface PlacePresetInput {
  name?: string;
  latitude?: number | null;
  longitude?: number | null;
  locationDescription?: string | null;
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
}
