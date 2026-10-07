import { TicketTransferService } from '../ticket-transfer.service';

export function createTicketTransferServiceFixture() {
  const now = new Date();
  const holder = { id: 'sender-person', name: 'Sender Name', identityDocument: '52998224725', isCPF: true, userId: 'sender-user' };
  const event = {
    id: 'event-1',
    name: 'Kit de boas-vindas',
    majorEventId: null,
    endDate: new Date(now.getTime() + 86_400_000),
    eventGroup: null,
  };
  const ticket = {
    id: 'ticket-1',
    eventId: event.id,
    holderPersonId: holder.id,
    status: 'ACTIVE',
    expiresAt: new Date(now.getTime() + 86_400_000),
    ticketConfig: {
      enabled: true,
      transferable: true,
      displayName: 'Kit de boas-vindas',
      recipientSubscriptionRequirement: 'ANY',
      recipientRequiresUnesp: false,
      recipientAcademicIdPrefixes: [],
      recipientCourseCodes: [],
      recipientRequiresAccountManagerVerification: false,
      recipientAllowedPriceTierIds: [],
      transferEligibilityDescription: null,
    },
    event,
    holder,
  };
  const transfer: Record<string, unknown> = {
    id: 'transfer-1',
    ticketId: ticket.id,
    eventId: event.id,
    senderPersonId: holder.id,
    senderUserId: holder.userId,
    recipientPersonId: null,
    recipientUserId: null,
    authorUserId: holder.userId,
    initiatorType: 'HOLDER',
    initiatingAdminUserId: null,
    submittedDestinationIdentityDocumentEncrypted: 'encrypted-document',
    senderStatus: 'PENDING',
    recipientStatus: 'PENDING',
    ignoreReason: null,
    createdAt: now,
    updatedAt: now,
    acceptedAt: null,
    canceledAt: null,
    ignoredAt: null,
    ticket: {
      ...ticket,
      originalHolderPersonId: holder.id,
      source: 'ADMIN',
      sourceKey: null,
      issuedAt: now,
      consumedAt: null,
      consumedByPersonId: null,
      revokedAt: null,
      revokedReason: null,
      createdAt: now,
      updatedAt: now,
      ticketConfig: {
        ...ticket.ticketConfig,
        displayEmoji: '🎁',
        description: null,
        transferEligibilityDescription: null,
      },
      originalHolder: holder,
    },
    event,
    sender: holder,
    recipient: null,
    author: { id: holder.userId, name: 'Sender User' },
    initiatingAdmin: null,
  };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue([]),
    eventTicket: { findUnique: jest.fn().mockResolvedValue(ticket), findFirst: jest.fn().mockResolvedValue(null) },
    people: { findFirst: jest.fn() },
    ticketTransfer: {
      findUnique: jest.fn().mockResolvedValue(transfer),
      findUniqueOrThrow: jest.fn().mockResolvedValue(transfer),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...transfer,
        ...data,
        ticket: transfer.ticket,
        event,
        sender: holder,
        author: { id: holder.userId, name: 'Sender User' },
      })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ticketTransferAuthorCooldown: {
      upsert: jest.fn().mockResolvedValue({ submissionCount: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
    ticketTransferResolutionOutbox: { create: jest.fn().mockResolvedValue({}) },
    ticketNotificationOutbox: { create: jest.fn().mockResolvedValue({}) },
    eventTicketHistory: { create: jest.fn().mockResolvedValue({}) },
    auditLogEntry: { create: jest.fn().mockResolvedValue({}) },
    user: { findUnique: jest.fn().mockResolvedValue({ name: 'Sender User', email: null }) },
  };
  const prisma = {
    eventTicket: tx.eventTicket,
    ticketTransfer: tx.ticketTransfer,
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const identities = {
    protect: jest.fn().mockReturnValue({ encryptedValue: 'encrypted-document' }),
    reveal: jest.fn().mockReturnValue('PASS-12345'),
  };
  const eligibility = { prepareIdentitySnapshot: jest.fn(), evaluateRecipientEligibility: jest.fn().mockResolvedValue({ eligible: true }) };
  const realtime = { enqueueForUsers: jest.fn().mockResolvedValue(undefined) };
  const frozenResources = { assertEventMutable: jest.fn() };
  const service = new TicketTransferService(prisma as never, identities as never, eligibility as never, realtime as never, frozenResources as never);
  return { service, tx, eligibility, transfer, ticket, frozenResources };
}
