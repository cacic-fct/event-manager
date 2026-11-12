import { Prisma } from '@prisma/client';

export const LGPD_EVENT_INTEREST_SELECT = {
  id: true,
  personId: true,
  eventId: true,
  eventGroupId: true,
  majorEventId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.EventInterestSelect;

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
  deletedAt: true,
} satisfies Prisma.EventSubscriptionSelect;

export const LGPD_EVENT_GROUP_SUBSCRIPTION_SELECT = {
  id: true,
  eventGroupId: true,
  personId: true,
  createdAt: true,
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
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
} satisfies Prisma.EventDraftSelect;

export const LGPD_EVENT_ATTENDANCE_SELECT = {
  personId: true,
  eventId: true,
  attendedAt: true,
  createdAt: true,
} satisfies Prisma.EventAttendanceSelect;

export const LGPD_EVENT_LECTURER_SELECT = {
  eventId: true,
  personId: true,
  createdAt: true,
} satisfies Prisma.EventLecturerSelect;

export const LGPD_PRIZE_DRAW_MANUAL_ENTRY_SELECT = {
  id: true,
  drawId: true,
  personId: true,
  name: true,
  createdAt: true,
} satisfies Prisma.PrizeDrawManualEntrySelect;

export const LGPD_PRIZE_DRAW_EXCLUSION_SELECT = {
  id: true,
  drawId: true,
  personId: true,
  createdAt: true,
} satisfies Prisma.PrizeDrawExcludedPersonSelect;

export const LGPD_PRIZE_DRAW_FROZEN_ENTRY_SELECT = {
  id: true,
  drawId: true,
  personId: true,
  displayName: true,
  createdAt: true,
} satisfies Prisma.PrizeDrawFrozenEntrySelect;

export const LGPD_PRIZE_DRAW_SPIN_ENTRY_SELECT = {
  id: true,
  spinId: true,
  personId: true,
  displayName: true,
  winner: true,
  createdAt: true,
} satisfies Prisma.PrizeDrawSpinEntrySelect;

export const LGPD_PRIZE_DRAW_WIN_SELECT = {
  id: true,
  drawId: true,
  sequence: true,
  winnerPersonId: true,
  winnerDisplayName: true,
  drawnAt: true,
  undoneAt: true,
} satisfies Prisma.PrizeDrawSpinSelect;

export const LGPD_CERTIFICATE_SELECT = {
  id: true,
  personId: true,
  issuedAt: true,
  deletedAt: true,
} satisfies Prisma.CertificateSelect;

export const LGPD_MAJOR_EVENT_RECEIPT_SELECT = {
  id: true,
  subscriptionId: true,
  majorEventId: true,
  personId: true,
  fileName: true,
  uploadedAt: true,
  processingStatus: true,
} satisfies Prisma.MajorEventReceiptSelect;

export const LGPD_PEOPLE_MERGE_OPERATION_SELECT = {
  id: true,
  targetPersonId: true,
  sourcePersonId: true,
  mergeCandidateId: true,
  status: true,
  rolledBackAt: true,
  createdAt: true,
} satisfies Prisma.PeopleMergeOperationSelect;

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
  peopleMergeOperationId: true,
  rolledBackAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ExternalAccountMergeOperationSelect;

export const LGPD_LECTURER_PROFILE_SELECT = {
  id: true,
  personId: true,
  displayName: true,
  biography: true,
  publishGoogleUserPicture: true,
  googleUserPicture: true,
  email: true,
  whatsapp: true,
  linkedin: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LecturerProfileSelect;
