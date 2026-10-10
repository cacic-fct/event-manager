export const TICKET_AZTEC_PREFIX = 'ticket' as const;

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ParsedTicketBarcode = {
  ticketId: string;
  holderUserId: string;
  userBarcode: string;
};

/** Parse a display barcode only; possession must always be checked from persisted ticket ownership. */
export function parseTicketBarcode(value: string): ParsedTicketBarcode | null {
  const parts = value.split(':');
  if (parts.length !== 3 || parts[0] !== TICKET_AZTEC_PREFIX || !UUID_V7_PATTERN.test(parts[1])) {
    return null;
  }

  const holderUserId = parts[2].trim();
  if (!holderUserId || holderUserId.includes(':')) {
    return null;
  }

  return {
    ticketId: parts[1].toLowerCase(),
    holderUserId,
    userBarcode: `user:${holderUserId}`,
  };
}

export const TicketLifecycleState = {
  Active: 'ACTIVE',
  Consumed: 'CONSUMED',
  Revoked: 'REVOKED',
  Expired: 'EXPIRED',
  Unavailable: 'UNAVAILABLE',
} as const;
export type TicketLifecycleState = (typeof TicketLifecycleState)[keyof typeof TicketLifecycleState];

export const TicketIssueSource = {
  EventSubscription: 'EVENT_SUBSCRIPTION',
  MajorEventSubscription: 'MAJOR_EVENT_SUBSCRIPTION',
  Admin: 'ADMIN',
  Purchase: 'PURCHASE',
} as const;
export type TicketIssueSource = (typeof TicketIssueSource)[keyof typeof TicketIssueSource];

export const TicketSubscriptionRequirement = {
  Any: 'ANY',
  Required: 'REQUIRED',
  None: 'NONE',
} as const;
export type TicketSubscriptionRequirement =
  (typeof TicketSubscriptionRequirement)[keyof typeof TicketSubscriptionRequirement];

export const TicketExpirationMode = {
  EventEnd: 'EVENT_END',
  Custom: 'CUSTOM',
} as const;
export type TicketExpirationMode = (typeof TicketExpirationMode)[keyof typeof TicketExpirationMode];

export const TicketTransferSenderStatus = {
  Pending: 'PENDING',
  Accepted: 'ACCEPTED',
  Canceled: 'CANCELED',
  Expired: 'EXPIRED',
} as const;
export type TicketTransferSenderStatus =
  (typeof TicketTransferSenderStatus)[keyof typeof TicketTransferSenderStatus];

export const TicketTransferRecipientStatus = {
  Pending: 'PENDING',
  Accepted: 'ACCEPTED',
  Ignored: 'IGNORED',
  SystemIneligible: 'SYSTEM_INELIGIBLE',
  SystemDuplicate: 'SYSTEM_DUPLICATE',
} as const;
export type TicketTransferRecipientStatus =
  (typeof TicketTransferRecipientStatus)[keyof typeof TicketTransferRecipientStatus];

export const TicketTransferIgnoreReason = {
  UserIgnored: 'USER_IGNORED',
  Ineligible: 'INELIGIBLE',
  AlreadyHeld: 'ALREADY_HELD',
} as const;
export type TicketTransferIgnoreReason =
  (typeof TicketTransferIgnoreReason)[keyof typeof TicketTransferIgnoreReason];

export const TicketPurchaseStatus = {
  UnderReview: 'UNDER_REVIEW',
  Approved: 'APPROVED',
  Rejected: 'REJECTED',
} as const;
export type TicketPurchaseStatus = (typeof TicketPurchaseStatus)[keyof typeof TicketPurchaseStatus];

export type TicketRecipientPolicy = {
  subscriptionRequirement: TicketSubscriptionRequirement;
  requiresUnesp: boolean;
  requiredAcademicIdPrefixes: readonly string[];
  requiredCourseCodes: readonly string[];
  requiresAccountManagerVerification: boolean;
  allowedPriceTierIds: readonly string[];
};

export type TicketPriceOption = {
  id: string;
  /** Null means this is the one-price option independent of subscription tier. */
  priceTierId: string | null;
  label: string;
  amountCents: number;
};

export type TicketPriceOptionInput = Omit<TicketPriceOption, 'id'> & { id?: string | null };

export type TicketPurchaseVisibilityPolicy = Omit<TicketRecipientPolicy, 'subscriptionRequirement'> & {
  subscriptionRequirement: 'REQUIRED';
  requiresValidatedSubscription: true;
};

export type TicketConfig = {
  id: string;
  eventId: string;
  enabled: boolean;
  displayName: string | null;
  displayEmoji: string | null;
  description: string | null;
  transferEligibilityDescription: string | null;
  transferable: boolean;
  issueOnEventSubscription: boolean;
  issueOnMajorEventSubscription: boolean;
  includedPriceTierIds: readonly string[];
  recipientPolicy: TicketRecipientPolicy;
  purchaseEnabled: boolean;
  purchaseLimit: number | null;
  purchaseVisibility: TicketPurchaseVisibilityPolicy;
  priceOptions: readonly TicketPriceOption[];
  expirationMode: TicketExpirationMode;
  customExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TicketConfigInput = Omit<TicketConfig, 'id' | 'createdAt' | 'updatedAt' | 'priceOptions' | 'purchaseLimit'> & {
  purchaseLimit?: number | null;
  priceOptions: readonly TicketPriceOptionInput[];
};

export type TicketEligibilityWarning = {
  code:
    | 'SUBSCRIPTION_REQUIRED'
    | 'UNESP_REQUIRED'
    | 'ACADEMIC_ID_REQUIRED'
    | 'COURSE_REQUIRED'
    | 'VERIFICATION_REQUIRED'
    | 'PRICE_TIER_REQUIRED'
    | 'TICKET_DISABLED'
    | 'PURCHASE_DISABLED';
  message: string;
};

export type AdminTicketEligibility = {
  eligible: boolean;
  warnings: readonly TicketEligibilityWarning[];
};

export type AdminTicketConfig = TicketConfig & {
  event: TicketEventSummary;
  majorEventId: string | null;
  warnings: readonly TicketEligibilityWarning[];
};

export type TicketEventSummary = {
  id: string;
  name: string;
  emoji: string;
  type?: string;
  startsAt: string;
  endsAt: string;
  locationDescription?: string | null;
  /** Visible events link to their public page. Hidden events still include their summary. */
  publicUrl: string | null;
};

export type TicketPersonSummary = {
  personId: string;
  fullName: string;
  firstName: string;
  avatarUrl: string | null;
  redactedIdentityDocument: string | null;
};

export type WalletTicket = {
  id: string;
  eventId: string;
  name: string;
  emoji: string;
  description: string | null;
  transferEligibilityDescription: string | null;
  status: TicketLifecycleState;
  transferable: boolean;
  effectiveExpiresAt: string;
  event: TicketEventSummary;
  holder: TicketPersonSummary | null;
  /** Display-only Aztec payload; the backend must resolve possession from persisted ownership. */
  aztecPayload: string | null;
};

export type TicketTransfer = {
  id: string;
  ticket: WalletTicket;
  event: TicketEventSummary;
  sender: TicketPersonSummary | null;
  /** Set for recipient-facing details only. */
  recipient: TicketPersonSummary | null;
  /** Returned only to the request author; never include in notifications or audit snapshots. */
  submittedDestinationIdentityDocument: string | null;
  senderStatus: TicketTransferSenderStatus;
  recipientStatus: TicketTransferRecipientStatus;
  /** Present only for the recipient or administrators. */
  ignoreReason: TicketTransferIgnoreReason | null;
  initiatedByAdmin: boolean;
  initiatingAdmin: Pick<TicketPersonSummary, 'personId' | 'firstName' | 'avatarUrl'> | null;
  createdAt: string;
  updatedAt: string;
  expiresFromListAt: string | null;
  canCancel: boolean;
  canAccept: boolean;
};

export type TicketTransferLists = {
  incomingPending: readonly TicketTransfer[];
  incomingIgnored: readonly TicketTransfer[];
  outgoing: readonly TicketTransfer[];
};

export type TicketPurchaseEventSummary = {
  id: string;
  name: string;
  emoji: string;
  startDate: string;
  endDate: string;
  isPubliclyListed: boolean;
  locationDescription: string | null;
};

export type TicketPurchaseOption = {
  eventId: string;
  majorEventId: string;
  ticketConfigId: string;
  name: string;
  emoji: string;
  description: string | null;
  amountCents: number;
  priceTierId: string | null;
  priceTierName: string | null;
  expiresAt: string;
  event: TicketPurchaseEventSummary;
};

export type TicketPurchaseReceipt = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  imageUrl: string;
  expiresAt: string;
  processingStatus: 'PENDING' | 'OCR_DONE' | 'CONVERTED' | 'FAILED';
  amountMatched?: boolean | null;
  nameMatched?: boolean | null;
};

export type TicketPurchase = {
  id: string;
  eventId: string;
  majorEventId: string;
  ticketConfigId: string;
  name: string;
  emoji: string;
  priceTierName: string | null;
  amountCents: number;
  status: TicketPurchaseStatus;
  receipt: TicketPurchaseReceipt;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminTicketPurchase = TicketPurchase & {
  person: TicketPersonSummary;
  ticketName: string;
  ticketEmoji: string;
  priceTierId: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
};

export type AdminTicketHistoryEntry = {
  id: string;
  ticketId: string;
  operation:
    | 'ISSUED'
    | 'TRANSFER_REQUESTED'
    | 'TRANSFER_ACCEPTED'
    | 'TRANSFER_IGNORED'
    | 'TRANSFER_CANCELED'
    | 'TRANSFERRED'
    | 'CONSUMED'
    | 'REVOKED';
  previousHolder: TicketPersonSummary | null;
  newHolder: TicketPersonSummary | null;
  actorName: string | null;
  reason: string | null;
  createdAt: string;
};

export type AdminEventTicketList = {
  tickets: readonly AdminEventTicket[];
  nextCursor: string | null;
  totalCount: number;
};

export type AdminTicketIssueInput = {
  eventId: string;
  personId: string;
  reason: string;
};

export type AdminTicketRevokeInput = {
  ticketId: string;
  reason: string;
};

export type AdminTicketTransferInput = {
  ticketId: string;
  recipientPersonId: string;
  reason: string;
};

export type AdminEventTicket = WalletTicket & {
  originalHolder: TicketPersonSummary | null;
  source: TicketIssueSource;
  sourceReference: string | null;
  lastHistoryEntry: AdminTicketHistoryEntry | null;
};

/** Realtime messages contain invalidation IDs only, never names or identity documents. */
export type TicketRealtimeInvalidation = {
  revision: string;
  type: 'TICKETS_CHANGED' | 'TRANSFERS_CHANGED' | 'PURCHASES_CHANGED';
  eventId?: string;
  ticketId?: string;
  transferId?: string;
  purchaseId?: string;
  changedAt: string;
};

export type TicketTransferRealtimeEvent = TicketRealtimeInvalidation;
