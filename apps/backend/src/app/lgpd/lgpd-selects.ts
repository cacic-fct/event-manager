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

export const LGPD_MCP_ADMIN_DELEGATION_SELECT = {
  id: true,
  userId: true,
  clientId: true,
  resource: true,
  eventIds: true,
  capabilities: true,
  maxProposals: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true,
} satisfies Prisma.McpAdminDelegationSelect;

export const LGPD_MCP_ADMIN_PROPOSAL_SELECT = {
  operation: true,
  id: true,
  delegationId: true,
  eventId: true,
  state: true,
  createdAt: true,
  expiresAt: true,
  decidedAt: true,
  approvedById: true,
  approvedByName: true,
} satisfies Prisma.McpAdminProposalSelect;

export const LGPD_MCP_ADMIN_OPERATION_LOG_SELECT = {
  id: true,
  userId: true,
  clientId: true,
  delegationId: true,
  tool: true,
  eventId: true,
  proposalId: true,
  outcome: true,
  createdAt: true,
} satisfies Prisma.McpAdminOperationLogSelect;

export const LGPD_MCP_OPERATION_DELEGATION_SELECT = {
  id: true,
  userId: true,
  clientId: true,
  resource: true,
  operations: true,
  scope: true,
  personalData: true,
  maxProposals: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true,
} satisfies Prisma.McpAdminOperationDelegationSelect;

// Command arguments may contain other people's contacts or financial information.
// Export decision evidence only, without payloads, fingerprints or idempotency keys.
export const LGPD_MCP_COMMAND_SELECT = {
  id: true,
  delegationId: true,
  operation: true,
  state: true,
  createdAt: true,
  expiresAt: true,
  decidedAt: true,
  approvedById: true,
  approvedByName: true,
} satisfies Prisma.McpAdminCommandSelect;
