import { TicketTransferIgnoreReason, TicketTransferRecipientStatus } from '@prisma/client';
import { classifyRecipientResolution, transferStartAvailableAt } from './ticket-transfer-policy';
import { mapTicketTransfer } from './ticket.mapper';
import { mapWalletTicket } from './ticket.mapper';
import { TicketTransferRecord, TicketTransferService } from './ticket-transfer.service';

describe('ticket transfer privacy policies', () => {
  it('hides disabled ticket actions and credentials', () => {
    const transfer = transferFixture();
    transfer.ticket.ticketConfig.enabled = false;
    const ticket = mapWalletTicket(transfer.ticket, true);
    expect(ticket.status).toBe('UNAVAILABLE');
    expect(ticket.transferable).toBe(false);
    expect(ticket.aztecPayload).toBeNull();
    const recipientView = mapTicketTransfer(transfer, 'RECIPIENT', {} as never);
    expect(recipientView.canAccept).toBe(false);
  });

  it.each(['AB123456', '12'])('redacts non-CPF sender documents: %s', (document) => {
    const transfer = transferFixture();
    transfer.sender.identityDocument = document;
    transfer.sender.isCPF = false;
    const result = mapTicketTransfer(transfer, 'RECIPIENT', { revealSubmittedDocument: () => null } as never);
    expect(result.sender?.redactedIdentityDocument).toBe('••••');
  });

  it('returns the same sender-facing pending outcome for unknown and ineligible recipients', () => {
    const unknown = classifyRecipientResolution({
      personFound: false,
      hasUserAccount: false,
      alreadyHoldsTicket: false,
      eligible: false,
    });
    const ineligible = classifyRecipientResolution({
      personFound: true,
      hasUserAccount: true,
      alreadyHoldsTicket: false,
      eligible: false,
    });

    expect(unknown.status).toBe(TicketTransferRecipientStatus.SYSTEM_INELIGIBLE);
    expect(ineligible.status).toBe(TicketTransferRecipientStatus.SYSTEM_INELIGIBLE);
    expect(unknown.ignoreReason).toBe(TicketTransferIgnoreReason.INELIGIBLE);
    expect(unknown.notifyRecipient).toBe(false);
    expect(ineligible.notifyRecipient).toBe(true);
  });

  it('auto ignores duplicate holders without notifying them', () => {
    expect(classifyRecipientResolution({
      personFound: true,
      hasUserAccount: true,
      alreadyHoldsTicket: true,
      eligible: true,
    })).toEqual({
      status: TicketTransferRecipientStatus.SYSTEM_DUPLICATE,
      ignoreReason: TicketTransferIgnoreReason.ALREADY_HELD,
      notifyRecipient: false,
    });
  });

  it('makes transfer start cooldown cumulative per author submission count', () => {
    const submittedAt = new Date();
    expect(transferStartAvailableAt(submittedAt, 0)).toEqual(submittedAt);
    expect(transferStartAvailableAt(submittedAt, 1)).toEqual(submittedAt);
    expect(transferStartAvailableAt(submittedAt, 2).getTime() - submittedAt.getTime()).toBe(5_000);
    expect(transferStartAvailableAt(submittedAt, 3).getTime() - submittedAt.getTime()).toBe(10_000);
    expect(transferStartAvailableAt(submittedAt, 100).getTime() - submittedAt.getTime()).toBe(24 * 60 * 60 * 1_000);
  });

  it('hides all recipient resolution data and timing changes from the sender', () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 5_000);
    const transfer = transferFixture({
      recipientStatus: TicketTransferRecipientStatus.SYSTEM_INELIGIBLE,
      ignoreReason: TicketTransferIgnoreReason.INELIGIBLE,
      updatedAt: new Date(createdAt.getTime() + 5_000),
      recipient: { id: 'person-secret', name: 'Recipient Name', identityDocument: '52998224725', isCPF: true },
      recipientUserId: 'user-secret',
    });
    const identityService = { revealSubmittedDocument: () => 'PASS-12345' } as unknown as TicketTransferService;

    const sender = mapTicketTransfer(transfer, 'AUTHOR', identityService, now);

    expect(sender.senderStatus).toBe('PENDING');
    expect(sender.recipientStatus).toBe('PENDING');
    expect(sender.ignoreReason).toBeNull();
    expect(sender.recipient).toBeNull();
    expect(sender.updatedAt).toEqual(createdAt);
    expect(sender.submittedDestinationIdentityDocument).toBe('PASS-12345');
    expect(JSON.stringify(sender)).not.toContain('person-secret');
    expect(JSON.stringify(sender)).not.toContain('user-secret');
  });

  it('shows system ignore reasons only to the receiving user', () => {
    const transfer = transferFixture({
      recipientStatus: TicketTransferRecipientStatus.SYSTEM_DUPLICATE,
      ignoreReason: TicketTransferIgnoreReason.ALREADY_HELD,
      recipient: { id: 'recipient-1', name: 'Recipient Name', identityDocument: '52998224725', isCPF: true },
      recipientUserId: 'recipient-user',
    });
    const identityService = { revealSubmittedDocument: () => null } as unknown as TicketTransferService;

    const recipient = mapTicketTransfer(transfer, 'RECIPIENT', identityService, new Date());

    expect(recipient.recipientStatus).toBe(TicketTransferRecipientStatus.SYSTEM_DUPLICATE);
    expect(recipient.ignoreReason).toBe(TicketTransferIgnoreReason.ALREADY_HELD);
    expect(recipient.recipient?.fullName).toBe('Recipient Name');
    expect(recipient.sender?.redactedIdentityDocument).toBe('•••.982.247-••');
  });

  it('derives readable recipient criteria and tier names even when admins add no prose', () => {
    const transfer = transferFixture();
    const ticket = transfer.ticket as unknown as {
      ticketConfig: Record<string, unknown>;
      event: Record<string, unknown>;
    };
    ticket.ticketConfig = {
      ...ticket.ticketConfig,
      recipientSubscriptionRequirement: 'REQUIRED',
      recipientRequiresUnesp: true,
      recipientAcademicIdPrefixes: ['2026'],
      recipientCourseCodes: ['12'],
      recipientRequiresAccountManagerVerification: true,
      recipientAllowedPriceTierIds: ['tier-1'],
    };
    ticket.event = {
      ...ticket.event,
      majorEventId: 'major-1',
      majorEvent: {
        audience: 'PUBLIC',
        majorEventPrices: [{ tiers: [{ id: 'tier-1', name: 'Experiência Ouro' }] }],
      },
    };

    const walletTicket = mapWalletTicket(transfer.ticket, false);

    expect(walletTicket.transferEligibilityDescription).toContain('inscrito no grande evento');
    expect(walletTicket.transferEligibilityDescription).toContain('vínculo UNESP');
    expect(walletTicket.transferEligibilityDescription).toContain('Matrícula com prefixo 2026');
    expect(walletTicket.transferEligibilityDescription).toContain('Ciência da Computação (código 12)');
    expect(walletTicket.transferEligibilityDescription).toContain('verificação pela Conta do Aluno');
    expect(walletTicket.transferEligibilityDescription).toContain('Experiência Ouro');
  });
});

function transferFixture(overrides: Record<string, unknown> = {}): TicketTransferRecord {
  const now = new Date();
  const createdAt = new Date(now.getTime() - 5_000);
  const event = {
    id: 'event-1',
    name: 'Kit de boas-vindas',
    emoji: '🎁',
    type: 'OTHER',
    startDate: new Date(now.getTime() - 60 * 60 * 1_000),
    endDate: new Date(now.getTime() + 60 * 60 * 1_000),
    deletedAt: null,
    isPubliclyListed: false,
    publicationState: 'PUBLISHED',
    audience: 'PUBLIC',
    locationDescription: null,
    eventGroup: null,
    majorEvent: null,
  };
  return {
    id: 'transfer-1',
    ticketId: 'ticket-1',
    eventId: 'event-1',
    senderPersonId: 'sender-1',
    senderUserId: 'sender-user',
    recipientPersonId: 'recipient-1',
    recipientUserId: 'recipient-user',
    authorUserId: 'sender-user',
    initiatorType: 'HOLDER',
    initiatingAdminUserId: null,
    submittedDestinationIdentityDocumentEncrypted: 'encrypted',
    senderStatus: 'PENDING',
    recipientStatus: 'PENDING',
    ignoreReason: null,
    createdAt,
    updatedAt: createdAt,
    acceptedAt: null,
    canceledAt: null,
    ignoredAt: null,
    ticket: {
      id: 'ticket-1',
      eventId: 'event-1',
      ticketConfigId: 'config-1',
      holderPersonId: 'sender-1',
      originalHolderPersonId: 'sender-1',
      source: 'ADMIN',
      sourceKey: null,
      status: 'ACTIVE',
      issuedAt: createdAt,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
      consumedAt: null,
      consumedByPersonId: null,
      revokedAt: null,
      revokedReason: null,
      createdAt,
      updatedAt: createdAt,
      ticketConfig: {
        enabled: true,
        displayName: 'Kit de boas-vindas',
        displayEmoji: '🎁',
        description: null,
        transferEligibilityDescription: 'Apenas alunos de Ciência da Computação.',
        transferable: true,
        recipientSubscriptionRequirement: 'ANY',
        recipientRequiresUnesp: false,
        recipientAcademicIdPrefixes: [],
        recipientCourseCodes: [],
        recipientRequiresAccountManagerVerification: false,
        recipientAllowedPriceTierIds: [],
      },
      event: { ...event, majorEventId: null },
      holder: { id: 'sender-1', name: 'Sender Name', identityDocument: '52998224725', isCPF: true, userId: 'sender-user' },
      originalHolder: { id: 'sender-1', name: 'Sender Name', identityDocument: '52998224725', isCPF: true },
    },
    event,
    sender: { id: 'sender-1', name: 'Sender Name', identityDocument: '52998224725', isCPF: true, userId: 'sender-user' },
    recipient: null,
    author: { id: 'sender-user', name: 'Sender User', email: 'sender@example.com' },
    initiatingAdmin: null,
    history: [],
    ...overrides,
  } as unknown as TicketTransferRecord;
}
