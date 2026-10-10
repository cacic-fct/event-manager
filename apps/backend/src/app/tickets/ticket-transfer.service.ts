import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  EventTicketStatus,
  Prisma,
  SportsIdentityType,
  TicketHistoryOperation,
  TicketTransferIgnoreReason,
  TicketTransferInitiatorType,
  TicketTransferRecipientStatus,
  TicketTransferSenderStatus,
  TicketNotificationType,
} from '@prisma/client';
import { isValidCPF } from '@cacic-fct/shared-utils';
import { audienceContext, ANONYMOUS_AUDIENCE } from '../audiences/audience-context';
import { normalizeIdentityDocumentForLookup } from '../common/person-identity';
import { runSerializablePrismaTransaction } from '../common/serializable-prisma-transaction';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { SportsIdentityProtectionService } from '../sports/security/sports-identity-protection.service';
import { TicketEligibilityService } from './ticket-eligibility.service';
import { TicketRealtimeService } from './ticket-realtime.service';
import { recordTicketAudit } from './ticket-audit';
import { transferStartAvailableAt, classifyRecipientResolution } from './ticket-transfer-policy';
import { lockEventTicketExpiration } from './ticket-expiration-lock';

const MAX_USER_DOCUMENT_LENGTH = 64;
const MIN_PASSPORT_LENGTH = 4;
const MIN_TRANSFER_RESPONSE_MS = 500;
const MAJOR_EVENT_TIER_INCLUDE = {
  majorEventPrices: { include: { tiers: { select: { id: true, name: true } } } },
} satisfies Prisma.MajorEventInclude;
const TRANSFER_DETAILS_INCLUDE = {
  ticket: {
    include: {
      ticketConfig: true,
      event: {
        include: {
          eventGroup: { include: { majorEvent: { include: MAJOR_EVENT_TIER_INCLUDE } } },
          majorEvent: { include: MAJOR_EVENT_TIER_INCLUDE },
        },
      },
      holder: true,
      originalHolder: true,
    },
  },
  event: {
    include: {
      eventGroup: { include: { majorEvent: { include: MAJOR_EVENT_TIER_INCLUDE } } },
      majorEvent: { include: MAJOR_EVENT_TIER_INCLUDE },
    },
  },
  sender: true,
  recipient: true,
  author: true,
  initiatingAdmin: true,
} satisfies Prisma.TicketTransferInclude;

export type TicketTransferRecord = Prisma.TicketTransferGetPayload<{ include: typeof TRANSFER_DETAILS_INCLUDE }>;

type TransferIdentity = {
  encryptedDocument: string;
};

export type TicketTransferView = 'AUTHOR' | 'RECIPIENT' | 'ADMIN_SENDER';

@Injectable()
export class TicketTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identities: SportsIdentityProtectionService,
    private readonly eligibility: TicketEligibilityService,
    private readonly realtime: TicketRealtimeService,
    private readonly frozenResources: FrozenResourceService,
  ) {}

  async startForUser(
    ticketId: string,
    destinationIdentityDocument: string,
    user: AuthenticatedUser,
  ): Promise<TicketTransferRecord> {
    const startedAt = Date.now();
    try {
      const userId = this.requireUserId(user);
      const identity = this.parseAndProtectDocument(destinationIdentityDocument);
      return await runSerializablePrismaTransaction(this.prisma, async (tx) =>
        audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
          await this.lockAuthor(tx, userId);
          await this.lockTicket(tx, ticketId);

          const ticket = await this.requireTransferableTicket(tx, ticketId, false, userId);
          const sender = ticket.holder;
          if (!sender || sender.userId !== userId) throw new NotFoundException('Bilhete não encontrado.');

          const pending = await tx.ticketTransfer.findFirst({
            where: { ticketId, senderStatus: TicketTransferSenderStatus.PENDING },
            select: { id: true },
          });
          if (pending) throw new ConflictException('Já existe uma solicitação pendente para este bilhete.');

          await this.advanceAuthorStartCooldown(tx, userId, new Date());
          const transfer = await tx.ticketTransfer.create({
            data: {
              ticketId,
              eventId: ticket.eventId,
              senderPersonId: sender.id,
              senderUserId: sender.userId,
              authorUserId: userId,
              initiatorType: TicketTransferInitiatorType.HOLDER,
              submittedDestinationIdentityDocumentEncrypted: identity.encryptedDocument,
              senderStatus: TicketTransferSenderStatus.PENDING,
              recipientStatus: TicketTransferRecipientStatus.PENDING,
            },
            include: TRANSFER_DETAILS_INCLUDE,
          });

          await tx.eventTicketHistory.create({
            data: {
              ticketId,
              transferId: transfer.id,
              operation: TicketHistoryOperation.TRANSFER_REQUESTED,
              previousHolderPersonId: sender.id,
              actorUserId: userId,
            },
          });
          await tx.ticketTransferResolutionOutbox.create({ data: { transferId: transfer.id } });
          await this.writeTransferAudit(tx, transfer, AuditLogOperation.START, 'Transferência de bilhete iniciada.');
          await this.enqueueNotification(tx, transfer, TicketNotificationType.SENDER_STARTED, userId, this.firstName(sender.name));
          await this.realtime.enqueueForUsers(
            tx,
            [userId, sender.userId],
            {
              type: 'TRANSFERS_CHANGED',
              eventId: ticket.eventId,
              ticketId,
              transferId: transfer.id,
            },
          );
          return transfer;
        }),
      );
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe uma solicitação pendente para este bilhete.');
      }
      throw error;
    } finally {
      await this.waitForMinimumResponse(startedAt);
    }
  }

  async cancelForUser(transferId: string, user: AuthenticatedUser): Promise<TicketTransferRecord> {
    const userId = this.requireUserId(user);
    return runSerializablePrismaTransaction(this.prisma, async (tx) =>
      audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
        await this.lockAuthor(tx, userId);
        const transfer = await tx.ticketTransfer.findUnique({
          where: { id: transferId },
          include: TRANSFER_DETAILS_INCLUDE,
        });
        if (!transfer || transfer.authorUserId !== userId) throw new NotFoundException('Solicitação não encontrada.');
        if (transfer.initiatorType === TicketTransferInitiatorType.ADMIN) {
          await this.frozenResources.assertEventMutable(transfer.eventId, user, 'edit');
        }
        await this.lockTicket(tx, transfer.ticketId);
        if (transfer.senderStatus !== TicketTransferSenderStatus.PENDING) {
          throw new ConflictException('Esta solicitação não está mais pendente.');
        }
        const now = new Date();
        const changed = await tx.ticketTransfer.updateMany({
          where: {
            id: transferId,
            authorUserId: userId,
            senderStatus: TicketTransferSenderStatus.PENDING,
          },
          data: {
            senderStatus: TicketTransferSenderStatus.CANCELED,
            canceledAt: now,
            submittedDestinationIdentityDocumentEncrypted: null,
          },
        });
        if (changed.count !== 1) throw new ConflictException('Esta solicitação não está mais pendente.');

        await tx.eventTicketHistory.create({
          data: {
            ticketId: transfer.ticketId,
            transferId,
            operation: TicketHistoryOperation.TRANSFER_CANCELED,
            previousHolderPersonId: transfer.senderPersonId,
            newHolderPersonId: transfer.recipientPersonId,
            actorUserId: userId,
          },
        });
        await this.writeTransferAudit(
          tx,
          transfer,
          AuditLogOperation.UNDO,
          'Solicitação de transferência cancelada.',
          { senderStatus: TicketTransferSenderStatus.CANCELED },
          userId,
        );
        await this.enqueueNotification(tx, transfer, TicketNotificationType.SENDER_CANCELED, userId, this.firstName(transfer.sender?.name));
        if (transfer.senderUserId && transfer.senderUserId !== userId) {
          await this.enqueueNotification(
            tx,
            transfer,
            TicketNotificationType.SENDER_ADMIN_CANCELED,
            transfer.senderUserId,
            'Administração',
          );
        }
        await this.realtime.enqueueForUsers(tx, [userId, transfer.recipientUserId, transfer.senderUserId], {
          type: 'TRANSFERS_CHANGED',
          eventId: transfer.eventId,
          ticketId: transfer.ticketId,
          transferId,
        });
        return tx.ticketTransfer.findUniqueOrThrow({ where: { id: transferId }, include: TRANSFER_DETAILS_INCLUDE });
      }),
    );
  }

  private async systemIgnore(
    tx: Prisma.TransactionClient,
    transfer: TicketTransferRecord,
    status: Extract<TicketTransferRecipientStatus, 'SYSTEM_INELIGIBLE' | 'SYSTEM_DUPLICATE'>,
    reason: TicketTransferIgnoreReason,
    notifyRecipient: boolean,
    actorUserId?: string,
  ): Promise<TicketTransferRecord> {
    const now = new Date();
    const changed = await tx.ticketTransfer.updateMany({
      where: {
        id: transfer.id,
        senderStatus: TicketTransferSenderStatus.PENDING,
        recipientStatus: TicketTransferRecipientStatus.PENDING,
      },
      data: { recipientStatus: status, ignoreReason: reason, ignoredAt: now },
    });
    if (changed.count !== 1) throw new ConflictException('Esta solicitação não está mais disponível.');
    await tx.eventTicketHistory.create({
      data: {
        ticketId: transfer.ticketId,
        transferId: transfer.id,
        operation: TicketHistoryOperation.TRANSFER_IGNORED,
        previousHolderPersonId: transfer.senderPersonId,
        newHolderPersonId: transfer.recipientPersonId,
        reason,
        actorUserId: actorUserId ?? null,
      },
    });
    await this.writeTransferAudit(tx, transfer, AuditLogOperation.UPDATE, 'Solicitação de transferência ignorada pelo sistema.', {
      recipientStatus: status,
      ignoreReason: reason,
    }, actorUserId ?? null);
    if (notifyRecipient && transfer.recipientUserId) {
      await this.enqueueNotification(
        tx,
        transfer,
        TicketNotificationType.RECIPIENT_INELIGIBLE,
        transfer.recipientUserId,
        this.firstName(transfer.sender?.name),
      );
    }
    await this.realtime.enqueueForUsers(tx, [transfer.recipientUserId], {
      type: 'TRANSFERS_CHANGED',
      eventId: transfer.eventId,
      ticketId: transfer.ticketId,
      transferId: transfer.id,
    });
    return tx.ticketTransfer.findUniqueOrThrow({ where: { id: transfer.id }, include: TRANSFER_DETAILS_INCLUDE });
  }

  private async expireTransfer(
    tx: Prisma.TransactionClient,
    transfer: TicketTransferRecord,
    message: string,
  ): Promise<TicketTransferRecord> {
    const changed = await tx.ticketTransfer.updateMany({
      where: { id: transfer.id, senderStatus: TicketTransferSenderStatus.PENDING },
      data: {
        senderStatus: TicketTransferSenderStatus.EXPIRED,
        submittedDestinationIdentityDocumentEncrypted: null,
      },
    });
    if (changed.count !== 1) throw new ConflictException(message);
    await this.writeTransferAudit(
      tx,
      transfer,
      AuditLogOperation.UPDATE,
      message,
      { senderStatus: TicketTransferSenderStatus.EXPIRED },
      null,
    );
    await this.realtime.enqueueForUsers(tx, [transfer.authorUserId, transfer.recipientUserId, transfer.senderUserId], {
      type: 'TRANSFERS_CHANGED',
      eventId: transfer.eventId,
      ticketId: transfer.ticketId,
      transferId: transfer.id,
    });
    return tx.ticketTransfer.findUniqueOrThrow({ where: { id: transfer.id }, include: TRANSFER_DETAILS_INCLUDE });
  }

  private async requireTransferableTicket(
    tx: Prisma.TransactionClient,
    ticketId: string,
    admin: boolean,
    expectedHolderUserId?: string,
  ) {
    const ticketScope = await tx.eventTicket.findUnique({
      where: { id: ticketId },
      select: { eventId: true },
    });
    if (!ticketScope) throw new NotFoundException('Bilhete não encontrado.');
    await lockEventTicketExpiration(tx, ticketScope.eventId, 'SHARE');
    const ticket = await tx.eventTicket.findUnique({
      where: { id: ticketId },
      include: {
        ticketConfig: true,
        event: { include: { eventGroup: true } },
        holder: true,
      },
    });
    if (!ticket || !ticket.holderPersonId || !ticket.holder) throw new NotFoundException('Bilhete não encontrado.');
    if (!admin && ticket.holder.userId !== expectedHolderUserId) {
      throw new NotFoundException('Bilhete não encontrado.');
    }
    if (ticket.status !== EventTicketStatus.ACTIVE || (!admin && ticket.expiresAt <= new Date())) {
      throw new GoneException('Este bilhete não está mais disponível para transferência.');
    }
    if (ticket.event.deletedAt || !ticket.ticketConfig.enabled || (!admin && !ticket.ticketConfig.transferable)) {
      throw new ConflictException('Este bilhete não pode ser transferido.');
    }
    return ticket;
  }

  private parseAndProtectDocument(rawValue: string): TransferIdentity {
    const value = rawValue.normalize('NFKC').trim();
    if (!value || value.length > MAX_USER_DOCUMENT_LENGTH) {
      throw new BadRequestException('Informe um CPF ou passaporte válido.');
    }
    const onlyCpfFormatting = /^[\d.\s/-]+$/.test(value);
    const digits = value.replace(/\D/g, '');
    const cpfDetected = onlyCpfFormatting && digits.length === 11;
    if (cpfDetected && !isValidCPF(digits)) throw new BadRequestException('O CPF informado é inválido.');

    const normalizedDocument = normalizeIdentityDocumentForLookup(cpfDetected ? digits : value);
    if (normalizedDocument.length < MIN_PASSPORT_LENGTH || normalizedDocument.length > MAX_USER_DOCUMENT_LENGTH) {
      throw new BadRequestException('Informe um CPF ou passaporte válido.');
    }
    const encryptedDocument = this.identities.protect(
      SportsIdentityType.IDENTITY_DOCUMENT,
      normalizedDocument,
    ).encryptedValue;
    return { encryptedDocument };
  }

  private async advanceAuthorStartCooldown(
    tx: Prisma.TransactionClient,
    userId: string,
    submittedAt: Date,
  ): Promise<void> {
    const state = await tx.ticketTransferAuthorCooldown.upsert({
      where: { userId },
      create: { userId, submissionCount: 0, lastSubmittedAt: null },
      update: {},
    });
    if (state.lastSubmittedAt) {
      const availableAt = transferStartAvailableAt(state.lastSubmittedAt, state.submissionCount);
      if (availableAt > submittedAt) {
        throw new ConflictException(`Você poderá iniciar outra transferência em ${availableAt.toISOString()}.`);
      }
    }
    await tx.ticketTransferAuthorCooldown.update({
      where: { userId },
      data: { submissionCount: { increment: 1 }, lastSubmittedAt: submittedAt },
    });
  }

  private async enqueueNotification(
    tx: Prisma.TransactionClient,
    transfer: Pick<TicketTransferRecord, 'id' | 'ticket' | 'event'>,
    notificationType: TicketNotificationType,
    recipientUserId: string,
    actorFirstName: string,
  ): Promise<void> {
    await tx.ticketNotificationOutbox.create({
      data: {
        transferId: transfer.id,
        notificationType,
        recipientUserId,
        ticketName: transfer.ticket.ticketConfig.displayName ?? transfer.event.name,
        eventName: transfer.event.name,
        actorFirstName,
        actionUrl: `/profile/wallet/ticket-transfers/${transfer.id}`,
      },
    });
  }

  private async writeTransferAudit(
    tx: Prisma.TransactionClient,
    transfer: TicketTransferRecord,
    operation: AuditLogOperation,
    summary: string,
    afterOverrides: Prisma.InputJsonObject = {},
    actorUserId?: string | null,
  ): Promise<void> {
    const event = transfer.event;
    const before = {
      senderStatus: transfer.senderStatus,
      recipientStatus: transfer.recipientStatus,
      ignoreReason: transfer.ignoreReason,
      senderPersonId: transfer.senderPersonId,
      recipientPersonId: transfer.recipientPersonId,
    };
    const isCreation = operation === AuditLogOperation.START;
    await recordTicketAudit(tx, {
      entityType: AuditLogEntityType.TICKET_TRANSFER,
      entityId: transfer.id,
      entityLabel: transfer.ticket.ticketConfig.displayName ?? event.name,
      operation,
      summary,
      actorUserId: actorUserId === undefined ? transfer.authorUserId : actorUserId,
      eventId: transfer.eventId,
      majorEventId: event.majorEventId ?? event.eventGroup?.majorEventId,
      ...(isCreation ? {} : { before }),
      after: { ...before, ...afterOverrides },
    });
  }

  private async lockAuthor(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    const key = `ticket-transfer-author:${userId}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }

  private async lockTicket(tx: Prisma.TransactionClient, ticketId: string): Promise<void> {
    const key = `ticket-transfer:${ticketId}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }

  private async lockHolder(tx: Prisma.TransactionClient, eventId: string, personId: string): Promise<void> {
    const key = `ticket-holder:${eventId}:${personId}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }

  private requireUserId(user: AuthenticatedUser): string {
    if (!user.sub) throw new NotFoundException('Usuário não encontrado.');
    return user.sub;
  }

  private firstName(value: string | null | undefined): string {
    return value?.trim().split(/\s+/u)[0] ?? 'Alguém';
  }

  private isWithinPostEventRetention(transfer: TicketTransferRecord, now: Date): boolean {
    return transfer.event.endDate.getTime() + 30 * 24 * 60 * 60 * 1_000 >= now.getTime();
  }

  private async waitForMinimumResponse(startedAt: number): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    const remaining = MIN_TRANSFER_RESPONSE_MS - (Date.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  }

  async ignoreForUser(transferId: string, user: AuthenticatedUser): Promise<TicketTransferRecord> {
    const userId = this.requireUserId(user);
    return runSerializablePrismaTransaction(this.prisma, async (tx) =>
      audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
        const transfer = await tx.ticketTransfer.findUnique({
          where: { id: transferId },
          include: TRANSFER_DETAILS_INCLUDE,
        });
        if (!transfer || transfer.recipientUserId !== userId) throw new NotFoundException('Solicitação não encontrada.');
        await this.lockTicket(tx, transfer.ticketId);
        if (
          transfer.senderStatus !== TicketTransferSenderStatus.PENDING ||
          transfer.recipientStatus !== TicketTransferRecipientStatus.PENDING
        ) {
          throw new ConflictException('Esta solicitação não pode mais ser ignorada.');
        }

        const changed = await tx.ticketTransfer.updateMany({
          where: {
            id: transferId,
            recipientUserId: userId,
            senderStatus: TicketTransferSenderStatus.PENDING,
            recipientStatus: TicketTransferRecipientStatus.PENDING,
          },
          data: {
            recipientStatus: TicketTransferRecipientStatus.IGNORED,
            ignoreReason: TicketTransferIgnoreReason.USER_IGNORED,
            ignoredAt: new Date(),
          },
        });
        if (changed.count !== 1) throw new ConflictException('Esta solicitação não pode mais ser ignorada.');

        await tx.eventTicketHistory.create({
          data: {
            ticketId: transfer.ticketId,
            transferId,
            operation: TicketHistoryOperation.TRANSFER_IGNORED,
            previousHolderPersonId: transfer.senderPersonId,
            newHolderPersonId: transfer.recipientPersonId,
            actorUserId: userId,
            reason: TicketTransferIgnoreReason.USER_IGNORED,
          },
        });
        await this.writeTransferAudit(
          tx,
          transfer,
          AuditLogOperation.UPDATE,
          'Destinatário ignorou a solicitação de transferência.',
          { recipientStatus: TicketTransferRecipientStatus.IGNORED, ignoreReason: TicketTransferIgnoreReason.USER_IGNORED },
          userId,
        );
        await this.realtime.enqueueForUsers(tx, [userId], {
          type: 'TRANSFERS_CHANGED',
          eventId: transfer.eventId,
          ticketId: transfer.ticketId,
          transferId,
        });
        return tx.ticketTransfer.findUniqueOrThrow({ where: { id: transferId }, include: TRANSFER_DETAILS_INCLUDE });
      }),
    );
  }

  async acceptForUser(transferId: string, user: AuthenticatedUser): Promise<TicketTransferRecord> {
    return this.accept(transferId, this.requireUserId(user));
  }

  async startForAdmin(
    ticketId: string,
    recipientPersonId: string,
    reason: string,
    admin: AuthenticatedUser,
  ): Promise<TicketTransferRecord> {
    const adminUserId = this.requireUserId(admin);
    const normalizedReason = reason.trim();
    if (!normalizedReason || normalizedReason.length > 1_000) {
      throw new BadRequestException('Informe o motivo da transferência administrativa.');
    }
    const targetTicket = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      this.prisma.eventTicket.findUnique({ where: { id: ticketId }, select: { eventId: true } }),
    );
    if (!targetTicket) throw new NotFoundException('Bilhete não encontrado.');
    await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      this.frozenResources.assertEventMutable(targetTicket.eventId, admin, 'edit'),
    );
    const identitySnapshot = await this.eligibility.prepareIdentitySnapshot(
      targetTicket.eventId,
      recipientPersonId,
      'recipient',
    );

    return runSerializablePrismaTransaction(this.prisma, async (tx) =>
      audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
        await this.lockAuthor(tx, adminUserId);
        await this.lockTicket(tx, ticketId);
        const ticket = await this.requireTransferableTicket(tx, ticketId, true);
        const sender = ticket.holder;
        if (!sender) throw new ConflictException('O bilhete não possui titular ativo.');
        const recipient = await tx.people.findFirst({
          where: { id: recipientPersonId, deletedAt: null, mergedIntoId: null, userId: { not: null } },
          select: { id: true, userId: true, name: true },
        });
        if (!recipient?.userId) throw new NotFoundException('Usuário destinatário não encontrado.');

        const pending = await tx.ticketTransfer.findFirst({
          where: { ticketId, senderStatus: TicketTransferSenderStatus.PENDING },
          select: { id: true },
        });
        if (pending) throw new ConflictException('Já existe uma solicitação pendente para este bilhete.');

        await this.lockHolder(tx, ticket.eventId, recipient.id);
        const duplicate = await tx.eventTicket.findFirst({
          where: {
            eventId: ticket.eventId,
            holderPersonId: recipient.id,
            status: { in: [EventTicketStatus.ACTIVE, EventTicketStatus.CONSUMED] },
          },
          select: { id: true },
        });
        const eligibility = duplicate
          ? null
          : await this.eligibility.evaluateRecipientEligibility(tx, ticket.eventId, recipient.id, identitySnapshot);
        const classification = classifyRecipientResolution({
          personFound: true,
          hasUserAccount: true,
          alreadyHoldsTicket: Boolean(duplicate),
          eligible: Boolean(eligibility?.eligible),
        });
        await this.advanceAuthorStartCooldown(tx, adminUserId, new Date());
        const transfer = await tx.ticketTransfer.create({
          data: {
            ticketId,
            eventId: ticket.eventId,
            senderPersonId: sender.id,
            senderUserId: sender.userId,
            recipientPersonId: recipient.id,
            recipientUserId: recipient.userId,
            authorUserId: adminUserId,
            initiatorType: TicketTransferInitiatorType.ADMIN,
            initiatingAdminUserId: adminUserId,
            senderStatus: TicketTransferSenderStatus.PENDING,
            recipientStatus: classification.status,
            ignoreReason: classification.ignoreReason,
            ignoredAt: classification.ignoreReason ? new Date() : null,
          },
          include: TRANSFER_DETAILS_INCLUDE,
        });
        await tx.eventTicketHistory.create({
          data: {
            ticketId,
            transferId: transfer.id,
            operation: TicketHistoryOperation.TRANSFER_REQUESTED,
            previousHolderPersonId: sender.id,
            newHolderPersonId: recipient.id,
            actorUserId: adminUserId,
            reason: normalizedReason,
          },
        });
        await this.writeTransferAudit(tx, transfer, AuditLogOperation.START, 'Administração iniciou uma transferência de bilhete.', {
          reason: normalizedReason,
        });
        if (classification.notifyRecipient) {
          await this.enqueueNotification(
            tx,
            transfer,
            classification.status === TicketTransferRecipientStatus.PENDING
              ? TicketNotificationType.RECIPIENT_REQUESTED
              : TicketNotificationType.RECIPIENT_INELIGIBLE,
            recipient.userId,
            this.firstName(sender.name),
          );
        }
        if (sender.userId) {
          await this.enqueueNotification(
            tx,
            transfer,
            TicketNotificationType.SENDER_ADMIN_STARTED,
            sender.userId,
            'Administração',
          );
        }
        await this.realtime.enqueueForUsers(tx, [recipient.userId, sender.userId, adminUserId], {
          type: 'TRANSFERS_CHANGED',
          eventId: ticket.eventId,
          ticketId,
          transferId: transfer.id,
        });
        return transfer;
      }),
    );
  }

  async listsForUser(user: AuthenticatedUser): Promise<{
    incomingPending: TicketTransferRecord[];
    incomingIgnored: TicketTransferRecord[];
    outgoing: TicketTransferRecord[];
  }> {
    const userId = this.requireUserId(user);
    return audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
      const [incoming, ignored, outgoing] = await Promise.all([
        this.prisma.ticketTransfer.findMany({
          where: {
            recipientUserId: userId,
            senderStatus: TicketTransferSenderStatus.PENDING,
            recipientStatus: TicketTransferRecipientStatus.PENDING,
            ticket: { status: EventTicketStatus.ACTIVE },
            OR: [
              { initiatorType: TicketTransferInitiatorType.ADMIN },
              { ticket: { expiresAt: { gt: new Date() } } },
            ],
          },
          include: TRANSFER_DETAILS_INCLUDE,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        this.prisma.ticketTransfer.findMany({
          where: {
            recipientUserId: userId,
            recipientStatus: {
              in: [
                TicketTransferRecipientStatus.IGNORED,
                TicketTransferRecipientStatus.SYSTEM_INELIGIBLE,
                TicketTransferRecipientStatus.SYSTEM_DUPLICATE,
              ],
            },
          },
          include: TRANSFER_DETAILS_INCLUDE,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        this.prisma.ticketTransfer.findMany({
          where: { authorUserId: userId },
          include: TRANSFER_DETAILS_INCLUDE,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      ]);
      const now = new Date();
      return {
        incomingPending: incoming,
        incomingIgnored: ignored.filter((item) => this.isWithinPostEventRetention(item, now)),
        outgoing: outgoing.filter((item) =>
          item.senderStatus !== TicketTransferSenderStatus.CANCELED || this.isWithinPostEventRetention(item, now),
        ),
      };
    });
  }

  async findForUser(transferId: string, user: AuthenticatedUser): Promise<{ transfer: TicketTransferRecord; view: TicketTransferView }> {
    const userId = this.requireUserId(user);
    return audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
      const transfer = await this.prisma.ticketTransfer.findUnique({
        where: { id: transferId },
        include: TRANSFER_DETAILS_INCLUDE,
      });
      if (!transfer) throw new NotFoundException('Solicitação não encontrada.');
      if (transfer.authorUserId === userId) {
        if (
          transfer.senderStatus === TicketTransferSenderStatus.CANCELED &&
          !this.isWithinPostEventRetention(transfer, new Date())
        ) {
          throw new NotFoundException('Solicitação não encontrada.');
        }
        return { transfer, view: 'AUTHOR' };
      }
      if (transfer.recipientUserId === userId) {
        const isIgnored =
          transfer.recipientStatus === TicketTransferRecipientStatus.IGNORED ||
          transfer.recipientStatus === TicketTransferRecipientStatus.SYSTEM_INELIGIBLE ||
          transfer.recipientStatus === TicketTransferRecipientStatus.SYSTEM_DUPLICATE;
        if (isIgnored && !this.isWithinPostEventRetention(transfer, new Date())) {
          throw new NotFoundException('Solicitação não encontrada.');
        }
        return { transfer, view: 'RECIPIENT' };
      }
      if (transfer.initiatorType === TicketTransferInitiatorType.ADMIN && transfer.senderUserId === userId) {
        if (
          transfer.senderStatus === TicketTransferSenderStatus.CANCELED &&
          !this.isWithinPostEventRetention(transfer, new Date())
        ) {
          throw new NotFoundException('Solicitação não encontrada.');
        }
        return { transfer, view: 'ADMIN_SENDER' };
      }
      throw new NotFoundException('Solicitação não encontrada.');
    });
  }

  revealSubmittedDocument(transfer: TicketTransferRecord): string | null {
    const encrypted = transfer.submittedDestinationIdentityDocumentEncrypted;
    if (!encrypted) return null;
    try {
      return this.identities.reveal(SportsIdentityType.IDENTITY_DOCUMENT, encrypted);
    } catch {
      return null;
    }
  }

  async accept(transferId: string, userId: string): Promise<TicketTransferRecord> {
    const preflight = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      this.prisma.ticketTransfer.findUnique({
        where: { id: transferId },
        select: { eventId: true, recipientPersonId: true, recipientUserId: true },
      }),
    );
    if (!preflight || preflight.recipientUserId !== userId || !preflight.recipientPersonId) {
      throw new NotFoundException('Solicitação não encontrada.');
    }
    const identitySnapshot = await this.eligibility.prepareIdentitySnapshot(
      preflight.eventId,
      preflight.recipientPersonId,
      'recipient',
    );
    return runSerializablePrismaTransaction(this.prisma, async (tx) =>
      audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
        const transfer = await tx.ticketTransfer.findUnique({
          where: { id: transferId },
          include: TRANSFER_DETAILS_INCLUDE,
        });
        if (!transfer || transfer.recipientUserId !== userId) throw new NotFoundException('Solicitação não encontrada.');
        if (
          transfer.senderStatus !== TicketTransferSenderStatus.PENDING ||
          transfer.recipientStatus !== TicketTransferRecipientStatus.PENDING
        ) {
          throw new ConflictException('Esta solicitação não está mais disponível.');
        }
        await this.lockTicket(tx, transfer.ticketId);
        await lockEventTicketExpiration(tx, transfer.eventId, 'SHARE');

        const recipient = await tx.people.findFirst({
          where: {
            id: transfer.recipientPersonId ?? undefined,
            userId,
            deletedAt: null,
            mergedIntoId: null,
          },
          select: { id: true, userId: true, name: true },
        });
        if (!recipient) throw new NotFoundException('Solicitação não encontrada.');

        const ticket = await tx.eventTicket.findUnique({
          where: { id: transfer.ticketId },
          include: {
            ticketConfig: true,
            event: { include: { eventGroup: true } },
            holder: true,
          },
        });
        if (!ticket || ticket.status !== EventTicketStatus.ACTIVE || !ticket.holderPersonId) {
          return this.expireTransfer(tx, transfer, 'Este bilhete não está mais disponível.');
        }
        if (
          (transfer.initiatorType !== TicketTransferInitiatorType.ADMIN && ticket.expiresAt <= new Date()) ||
          ticket.holderPersonId !== transfer.senderPersonId
        ) {
          return this.expireTransfer(tx, transfer, 'O prazo desta solicitação terminou.');
        }
        if (ticket.event.deletedAt || !ticket.ticketConfig.enabled || !ticket.ticketConfig.transferable && transfer.initiatorType !== TicketTransferInitiatorType.ADMIN) {
          return this.expireTransfer(tx, transfer, 'Este bilhete não pode mais ser transferido.');
        }

        await this.lockHolder(tx, ticket.eventId, recipient.id);
        const duplicate = await tx.eventTicket.findFirst({
          where: {
            eventId: ticket.eventId,
            holderPersonId: recipient.id,
            status: { in: [EventTicketStatus.ACTIVE, EventTicketStatus.CONSUMED] },
          },
          select: { id: true },
        });
        if (duplicate) {
          return this.systemIgnore(tx, transfer, TicketTransferRecipientStatus.SYSTEM_DUPLICATE, TicketTransferIgnoreReason.ALREADY_HELD, false);
        }

        const eligibility = await this.eligibility.evaluateRecipientEligibility(
          tx,
          transfer.eventId,
          recipient.id,
          identitySnapshot,
        );
        if (!eligibility.eligible) {
          return this.systemIgnore(
            tx,
            transfer,
            TicketTransferRecipientStatus.SYSTEM_INELIGIBLE,
            TicketTransferIgnoreReason.INELIGIBLE,
            true,
            userId,
          );
        }

        const now = new Date();
        const changedTicket = await tx.eventTicket.updateMany({
          where: {
            id: ticket.id,
            eventId: transfer.eventId,
            holderPersonId: transfer.senderPersonId ?? undefined,
            status: EventTicketStatus.ACTIVE,
            ...(transfer.initiatorType !== TicketTransferInitiatorType.ADMIN ? { expiresAt: { gt: now } } : {}),
          },
          data: { holderPersonId: recipient.id },
        });
        if (changedTicket.count !== 1) throw new ConflictException('Esta solicitação não está mais disponível.');

        const changedTransfer = await tx.ticketTransfer.updateMany({
          where: {
            id: transferId,
            recipientUserId: userId,
            senderStatus: TicketTransferSenderStatus.PENDING,
            recipientStatus: TicketTransferRecipientStatus.PENDING,
          },
          data: {
            senderStatus: TicketTransferSenderStatus.ACCEPTED,
            recipientStatus: TicketTransferRecipientStatus.ACCEPTED,
            acceptedAt: now,
            submittedDestinationIdentityDocumentEncrypted: null,
          },
        });
        if (changedTransfer.count !== 1) throw new ConflictException('Esta solicitação não está mais disponível.');

        await tx.eventTicketHistory.create({
          data: {
            ticketId: ticket.id,
            transferId,
            operation: TicketHistoryOperation.TRANSFERRED,
            previousHolderPersonId: transfer.senderPersonId,
            newHolderPersonId: recipient.id,
            actorUserId: userId,
          },
        });
        await tx.eventTicketHistory.create({
          data: {
            ticketId: ticket.id,
            transferId,
            operation: TicketHistoryOperation.TRANSFER_ACCEPTED,
            previousHolderPersonId: transfer.senderPersonId,
            newHolderPersonId: recipient.id,
            actorUserId: userId,
          },
        });
        await this.writeTransferAudit(
          tx,
          transfer,
          AuditLogOperation.ASSIGN,
          'Destinatário aceitou a transferência do bilhete.',
          {
            senderStatus: TicketTransferSenderStatus.ACCEPTED,
            recipientStatus: TicketTransferRecipientStatus.ACCEPTED,
            ignoreReason: null,
          },
          userId,
        );
        await recordTicketAudit(tx, {
          entityType: AuditLogEntityType.TICKET,
          entityId: ticket.id,
          entityLabel: ticket.ticketConfig.displayName ?? ticket.event.name,
          operation: AuditLogOperation.ASSIGN,
          summary: 'Titularidade do bilhete transferida.',
          actorUserId: userId,
          permission: null,
          eventId: ticket.eventId,
          majorEventId: ticket.event.majorEventId ?? ticket.event.eventGroup?.majorEventId,
          before: { status: EventTicketStatus.ACTIVE, holderPersonId: transfer.senderPersonId },
          after: { status: EventTicketStatus.ACTIVE, holderPersonId: recipient.id },
          metadata: { transferId },
        });
        if (transfer.senderUserId) {
          await this.enqueueNotification(
            tx,
            transfer,
            TicketNotificationType.SENDER_ACCEPTED,
            transfer.senderUserId,
            this.firstName(recipient.name),
          );
        }
        await this.realtime.enqueueForUsers(tx, [transfer.authorUserId, transfer.senderUserId, recipient.userId], {
          type: 'TRANSFERS_CHANGED',
          eventId: ticket.eventId,
          ticketId: ticket.id,
          transferId,
        });
        await this.realtime.enqueueForUsers(tx, [transfer.authorUserId, transfer.senderUserId, recipient.userId], {
          type: 'TICKETS_CHANGED',
          eventId: ticket.eventId,
          ticketId: ticket.id,
        });
        return tx.ticketTransfer.findUniqueOrThrow({ where: { id: transferId }, include: TRANSFER_DETAILS_INCLUDE });
      }),
    );
  }
}
