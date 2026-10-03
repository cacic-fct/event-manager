import type {
  AdminEventTicket,
  AdminTicketConfig,
  AdminTicketHistoryEntry,
  TicketEventSummary,
  TicketPersonSummary,
  TicketPurchase,
  TicketPurchaseEventSummary,
  TicketPurchaseOption,
  TicketPurchaseReceipt,
  TicketTransfer,
  TicketTransferLists,
  WalletTicket,
} from './lib/shared-ticketing';

const FIXTURE_TICKET_ID = '018f47a1-3d5b-7abc-8def-0123456789ab';
const FIXTURE_PERSON_ID = 'person-ticket-fixture';
const FIXTURE_EVENT_ID = 'event-ticket-fixture';
export const TICKET_FIXTURE_HOLDER_USER_ID = '018f47a1-3d5b-7abc-8def-0123456789ff';

export type WalletTicketFixtureOverrides = Omit<Partial<WalletTicket>, 'event' | 'holder'> & {
  event?: Partial<TicketEventSummary>;
  holder?: Partial<TicketPersonSummary> | null;
};

export type TicketTransferFixtureOverrides = Omit<
  Partial<TicketTransfer>,
  'ticket' | 'event' | 'sender' | 'recipient'
> & {
  ticket?: WalletTicketFixtureOverrides;
  event?: Partial<TicketEventSummary>;
  sender?: Partial<TicketPersonSummary> | null;
  recipient?: Partial<TicketPersonSummary> | null;
};

export type TicketPurchaseOptionFixtureOverrides = Omit<Partial<TicketPurchaseOption>, 'event'> & {
  event?: Partial<TicketPurchaseEventSummary>;
};

export type TicketPurchaseFixtureOverrides = Omit<Partial<TicketPurchase>, 'receipt'> & {
  receipt?: Partial<TicketPurchaseReceipt>;
};

function atOffset(now: Date, offsetMs: number): string {
  return new Date(now.getTime() + offsetMs).toISOString();
}

export function createTicketEventSummary(
  overrides: Partial<TicketEventSummary> = {},
  now = new Date(),
): TicketEventSummary {
  return {
    id: FIXTURE_EVENT_ID,
    name: 'Festa de encerramento',
    emoji: '🎉',
    type: 'OTHER',
    startsAt: atOffset(now, 2 * 60 * 60 * 1000),
    endsAt: atOffset(now, 10 * 60 * 60 * 1000),
    locationDescription: 'Salão de eventos',
    publicUrl: `/event/${FIXTURE_EVENT_ID}`,
    ...overrides,
  };
}

export function createTicketPersonSummary(overrides: Partial<TicketPersonSummary> = {}): TicketPersonSummary {
  return {
    personId: FIXTURE_PERSON_ID,
    fullName: 'Marina da Silva',
    firstName: 'Marina',
    avatarUrl: null,
    redactedIdentityDocument: '•••.982.247-••',
    ...overrides,
  };
}

export function createWalletTicket(overrides: WalletTicketFixtureOverrides = {}, now = new Date()): WalletTicket {
  const { event: eventOverrides, holder: holderOverride, ...ticketOverrides } = overrides;
  const event = createTicketEventSummary(eventOverrides, now);
  const id = ticketOverrides.id ?? FIXTURE_TICKET_ID;
  const status = ticketOverrides.status ?? 'ACTIVE';
  return {
    id,
    eventId: event.id,
    name: 'Festa de encerramento',
    emoji: '🎉',
    description: 'Acesso à festa de encerramento do congresso.',
    transferEligibilityDescription: 'Para pessoas inscritas no Congresso de Computação.',
    status,
    transferable: true,
    effectiveExpiresAt: atOffset(now, status === 'EXPIRED' ? -60_000 : 10 * 60 * 60 * 1000),
    aztecPayload: `ticket:${id}:${TICKET_FIXTURE_HOLDER_USER_ID}`,
    ...ticketOverrides,
    event,
    holder: holderOverride === null ? null : { ...createTicketPersonSummary(), ...holderOverride },
  };
}

export function createTicketTransfer(
  overrides: TicketTransferFixtureOverrides = {},
  now = new Date(),
): TicketTransfer {
  const {
    ticket: ticketOverrides,
    event: eventOverrides,
    sender: senderOverride,
    recipient: recipientOverride,
    ...transferOverrides
  } = overrides;
  const ticket = createWalletTicket(ticketOverrides, now);
  return {
    id: 'transfer-ticket-fixture',
    ticket,
    submittedDestinationIdentityDocument: null,
    senderStatus: 'PENDING',
    recipientStatus: 'PENDING',
    ignoreReason: null,
    initiatedByAdmin: false,
    initiatingAdmin: null,
    createdAt: atOffset(now, -60_000),
    updatedAt: atOffset(now, -60_000),
    expiresFromListAt: null,
    canCancel: true,
    canAccept: true,
    ...transferOverrides,
    event: { ...ticket.event, ...eventOverrides },
    sender: senderOverride === null
      ? null
      : { ...createTicketPersonSummary({ personId: 'person-ticket-sender' }), ...senderOverride },
    recipient: recipientOverride === null
      ? null
      : {
          ...createTicketPersonSummary({
            personId: 'person-ticket-recipient',
            fullName: 'João Pedro Oliveira',
            firstName: 'João',
          }),
          ...recipientOverride,
        },
  };
}

export function createTicketTransferLists(overrides: Partial<TicketTransferLists> = {}): TicketTransferLists {
  return {
    incomingPending: [],
    incomingIgnored: [],
    outgoing: [],
    ...overrides,
  };
}

function createTicketPurchaseEventSummary(
  overrides: Partial<TicketPurchaseEventSummary> = {},
  now = new Date(),
): TicketPurchaseEventSummary {
  return {
    id: FIXTURE_EVENT_ID,
    name: 'Festa de encerramento',
    emoji: '🎉',
    startDate: atOffset(now, 2 * 60 * 60 * 1000),
    endDate: atOffset(now, 10 * 60 * 60 * 1000),
    isPubliclyListed: true,
    locationDescription: 'Salão de eventos',
    ...overrides,
  };
}

export function createTicketPurchaseOption(
  overrides: TicketPurchaseOptionFixtureOverrides = {},
  now = new Date(),
): TicketPurchaseOption {
  const event = createTicketPurchaseEventSummary(overrides.event, now);
  return {
    eventId: event.id,
    majorEventId: 'major-event-ticket-fixture',
    ticketConfigId: 'ticket-config-fixture',
    name: 'Festa de encerramento',
    emoji: '🎉',
    description: 'Acesso à festa de encerramento.',
    amountCents: 2500,
    priceTierId: 'student-tier',
    priceTierName: 'Estudante',
    expiresAt: atOffset(now, 60 * 60 * 1000),
    ...overrides,
    event,
  };
}

export function createTicketPurchaseReceipt(
  overrides: Partial<TicketPurchaseReceipt> = {},
  now = new Date(),
): TicketPurchaseReceipt {
  return {
    id: 'receipt-ticket-fixture',
    fileName: 'comprovante.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 24_576,
    uploadedAt: atOffset(now, -30_000),
    imageUrl: '/api/ticket-purchases/purchase-ticket-fixture/receipt',
    expiresAt: atOffset(now, 30 * 24 * 60 * 60 * 1000),
    processingStatus: 'PENDING',
    amountMatched: null,
    nameMatched: null,
    ...overrides,
  };
}

export function createTicketPurchase(
  overrides: TicketPurchaseFixtureOverrides = {},
  now = new Date(),
): TicketPurchase {
  const { receipt: receiptOverride, ...purchaseOverrides } = overrides;
  const option = createTicketPurchaseOption(undefined, now);
  return {
    id: 'purchase-ticket-fixture',
    eventId: option.eventId,
    majorEventId: option.majorEventId,
    ticketConfigId: option.ticketConfigId,
    name: option.name,
    emoji: option.emoji,
    priceTierName: option.priceTierName,
    amountCents: option.amountCents,
    status: 'UNDER_REVIEW',
    rejectionReason: null,
    createdAt: atOffset(now, -30_000),
    updatedAt: atOffset(now, -30_000),
    ...purchaseOverrides,
    receipt: receiptOverride
      ? { ...createTicketPurchaseReceipt(undefined, now), ...receiptOverride }
      : createTicketPurchaseReceipt(undefined, now),
  };
}

export function createAdminTicketHistoryEntry(
  overrides: Partial<AdminTicketHistoryEntry> = {},
  now = new Date(),
): AdminTicketHistoryEntry {
  return {
    id: 'ticket-history-fixture',
    ticketId: FIXTURE_TICKET_ID,
    operation: 'ISSUED',
    previousHolder: null,
    newHolder: createTicketPersonSummary(),
    actorName: 'Equipe organizadora',
    reason: null,
    createdAt: atOffset(now, -60_000),
    ...overrides,
  };
}

export function createAdminEventTicket(
  overrides: Partial<AdminEventTicket> = {},
  now = new Date(),
): AdminEventTicket {
  return {
    ...createWalletTicket(overrides, now),
    originalHolder: createTicketPersonSummary(),
    source: 'EVENT_SUBSCRIPTION',
    sourceReference: 'subscription-ticket-fixture',
    lastHistoryEntry: null,
    ...overrides,
  };
}

export function createAdminTicketConfig(
  overrides: Omit<Partial<AdminTicketConfig>, 'event'> & { event?: Partial<TicketEventSummary> } = {},
  now = new Date(),
): AdminTicketConfig {
  const { event: eventOverrides, ...configOverrides } = overrides;
  const event = createTicketEventSummary(eventOverrides, now);
  return {
    id: 'ticket-config-fixture',
    eventId: event.id,
    enabled: true,
    displayName: 'Festa de encerramento',
    displayEmoji: '🎉',
    description: 'Acesso à festa de encerramento.',
    transferEligibilityDescription: null,
    transferable: true,
    issueOnEventSubscription: true,
    issueOnMajorEventSubscription: false,
    includedPriceTierIds: [],
    recipientPolicy: {
      subscriptionRequirement: 'ANY',
      requiresUnesp: false,
      requiredAcademicIdPrefixes: [],
      requiredCourseCodes: [],
      requiresAccountManagerVerification: false,
      allowedPriceTierIds: [],
    },
    purchaseEnabled: false,
    purchaseVisibility: {
      subscriptionRequirement: 'REQUIRED',
      requiresUnesp: false,
      requiredAcademicIdPrefixes: [],
      requiredCourseCodes: [],
      requiresAccountManagerVerification: false,
      allowedPriceTierIds: [],
      requiresValidatedSubscription: true,
    },
    priceOptions: [],
    expirationMode: 'EVENT_END',
    customExpiresAt: null,
    createdAt: atOffset(now, -24 * 60 * 60 * 1000),
    updatedAt: atOffset(now, -60_000),
    majorEventId: 'major-event-ticket-fixture',
    warnings: [],
    ...configOverrides,
    event,
  };
}
