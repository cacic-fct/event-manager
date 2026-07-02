import { Prisma } from '@prisma/client';

export const LGPD_ACCOUNT_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  identityDocument: true,
  academicId: true,
  unespRole: true,
  role: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export const LGPD_EVENT_SUBSCRIPTION_SELECT = {
  id: true,
  eventId: true,
  personId: true,
  eventGroupSubscriptionId: true,
  createdAt: true,
  createdByMethod: true,
  deletedAt: true,
} satisfies Prisma.EventSubscriptionSelect;

export const LGPD_EVENT_GROUP_SUBSCRIPTION_SELECT = {
  id: true,
  eventGroupId: true,
  personId: true,
  createdAt: true,
  createdByMethod: true,
  deletedAt: true,
  eventSubscriptions: {
    select: {
      id: true,
      eventId: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.EventGroupSubscriptionSelect;

export const LGPD_MAJOR_EVENT_SUBSCRIPTION_SELECT = {
  id: true,
  majorEventId: true,
  personId: true,
  amountPaid: true,
  paymentDate: true,
  paymentTier: true,
  subscriptionStatus: true,
  subscriptionFlow: true,
  desiredCourses: true,
  desiredLectures: true,
  desiredUncategorized: true,
  receiptRejectionReason: true,
  receiptValidatedAt: true,
  createdAt: true,
  createdByMethod: true,
  updatedAt: true,
  deletedAt: true,
  selectedEvents: {
    select: {
      id: true,
      eventId: true,
      preferenceOrder: true,
      createdAt: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.MajorEventSubscriptionSelect;

export const LGPD_EVENT_DRAFT_SELECT = {
  id: true,
  sourceEventId: true,
  name: true,
  createdById: true,
  createdByName: true,
  createdByEmail: true,
  updatedById: true,
  updatedByName: true,
  updatedByEmail: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
} satisfies Prisma.EventDraftSelect;

export const LGPD_EVENT_ATTENDANCE_SELECT = {
  personId: true,
  eventId: true,
  category: true,
  attendedAt: true,
  createdAt: true,
  createdByMethod: true,
  collectedLatitude: true,
  collectedLongitude: true,
  collectedAccuracyMeters: true,
} satisfies Prisma.EventAttendanceSelect;

export const LGPD_OFFLINE_ATTENDANCE_SUBMISSION_SELECT = {
  id: true,
  clientId: true,
  eventId: true,
  personId: true,
  status: true,
  createdByMethod: true,
  scannerCode: true,
  manualValue: true,
  collectedAt: true,
  authorUserId: true,
  authorName: true,
  authorEmail: true,
  submittedById: true,
  submittedAt: true,
  stagedReason: true,
  resolutionError: true,
  collectedLatitude: true,
  collectedLongitude: true,
  collectedAccuracyMeters: true,
  committedAt: true,
  committedById: true,
  rejectedAt: true,
  rejectedById: true,
  rejectionReason: true,
} satisfies Prisma.OfflineEventAttendanceSubmissionSelect;

export const LGPD_EVENT_LECTURER_SELECT = {
  eventId: true,
  personId: true,
  createdAt: true,
} satisfies Prisma.EventLecturerSelect;

export const LGPD_CERTIFICATE_SELECT = {
  id: true,
  personId: true,
  configId: true,
  renderedData: true,
  issuedAt: true,
  certificateTemplateId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.CertificateSelect;

export const LGPD_MAJOR_EVENT_RECEIPT_SELECT = {
  id: true,
  subscriptionId: true,
  majorEventId: true,
  personId: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  expiresAt: true,
  uploadedAt: true,
  processingStatus: true,
  processedAt: true,
  processingError: true,
  ocrText: true,
  expectedAmountCents: true,
  matchedAmountCents: true,
  amountMatched: true,
  matchedAmountText: true,
  nameMatched: true,
  matchedNameText: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MajorEventReceiptSelect;

export const LGPD_RECEIPT_VALIDATION_ACTION_SELECT = {
  id: true,
  subscriptionId: true,
  receiptId: true,
  action: true,
  previousStatus: true,
  nextStatus: true,
  previousRejectionReason: true,
  nextRejectionReason: true,
  createdAt: true,
  undoneAt: true,
} satisfies Prisma.MajorEventReceiptValidationActionSelect;

export const LGPD_PEOPLE_MERGE_OPERATION_SELECT = {
  id: true,
  targetPersonId: true,
  sourcePersonId: true,
  mergeCandidateId: true,
  status: true,
  rolledBackAt: true,
  createdAt: true,
} satisfies Prisma.PeopleMergeOperationSelect;

export const LGPD_MERGE_CANDIDATE_SELECT = {
  id: true,
  personAId: true,
  personBId: true,
  score: true,
  matchMethod: true,
  matchValue: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MergeCandidateSelect;

export const LGPD_ACCOUNT_USER_MERGE_SELECT = {
  oldUserId: true,
  newUserId: true,
  createdAt: true,
} satisfies Prisma.AccountUserMergeSelect;

export const LGPD_EXTERNAL_ACCOUNT_MERGE_OPERATION_SELECT = {
  id: true,
  eventId: true,
  type: true,
  oldUserId: true,
  newUserId: true,
  occurredAt: true,
  status: true,
  result: true,
  peopleMergeOperationId: true,
  errorMessage: true,
  attemptCount: true,
  rolledBackAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ExternalAccountMergeOperationSelect;

export const LGPD_AUDIT_LOG_SELECT = {
  id: true,
  entityType: true,
  entityId: true,
  operation: true,
  actorId: true,
  actorType: true,
  permission: true,
  eventId: true,
  majorEventId: true,
  eventGroupId: true,
  changedFields: true,
  groupedCount: true,
  firstRecordedAt: true,
  lastRecordedAt: true,
  createdAt: true,
  revertedAt: true,
  revertedById: true,
  revertedByEntryId: true,
  revertTargetId: true,
  revertMode: true,
  before: true,
  after: true,
  changes: true,
  metadata: true,
} satisfies Prisma.AuditLogEntrySelect;

export type LgpdOfflineSubmission = Prisma.OfflineEventAttendanceSubmissionGetPayload<{
  select: typeof LGPD_OFFLINE_ATTENDANCE_SUBMISSION_SELECT;
}>;
export type LgpdAuditLogEntry = Prisma.AuditLogEntryGetPayload<{ select: typeof LGPD_AUDIT_LOG_SELECT }>;
