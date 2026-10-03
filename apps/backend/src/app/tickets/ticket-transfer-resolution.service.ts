import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  EventTicketStatus,
  Prisma,
  SportsIdentityType,
  TicketHistoryOperation,
  TicketNotificationType,
  TicketTransferRecipientStatus,
  TicketTransferSenderStatus,
} from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { audienceContext, ANONYMOUS_AUDIENCE } from '../audiences/audience-context';
import { normalizeIdentityDocumentForLookup } from '../common/person-identity';
import { runSerializablePrismaTransaction } from '../common/serializable-prisma-transaction';
import { PrismaService } from '../prisma/prisma.service';
import { isValidCPF } from '@cacic-fct/shared-utils';
import { SportsIdentityProtectionService } from '../sports/security/sports-identity-protection.service';
import { TicketEligibilityService } from './ticket-eligibility.service';
import { TicketRealtimeService } from './ticket-realtime.service';
import { recordTicketAudit } from './ticket-audit';
import { classifyRecipientResolution } from './ticket-transfer-policy';
import { lockEventTicketExpiration } from './ticket-expiration-lock';

const RESOLUTION_BATCH_SIZE = 25;
const RESOLUTION_POLL_MS = 1_500;
const RESOLUTION_LEASE_MS = 30_000;

@Injectable()
export class TicketTransferResolutionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketTransferResolutionService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly identities: SportsIdentityProtectionService,
    private readonly eligibility: TicketEligibilityService,
    private readonly realtime: TicketRealtimeService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.processPending(), RESOLUTION_POLL_MS);
    this.timer.unref();
    void this.processPending();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  private async processPending(): Promise<void> {
    if (this.stopped || this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const jobs = await this.prisma.ticketTransferResolutionOutbox.findMany({
        where: {
          completedAt: null,
          nextAttemptAt: { lte: now },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: RESOLUTION_BATCH_SIZE,
      });
      for (const job of jobs) {
        if (this.stopped) return;
        const leaseUntil = new Date(Date.now() + RESOLUTION_LEASE_MS);
        const claim = await this.prisma.ticketTransferResolutionOutbox.updateMany({
          where: {
            id: job.id,
            completedAt: null,
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
          },
          data: { leaseUntil },
        });
        if (claim.count !== 1) continue;
        try {
          await this.resolve(job.transferId, job.id);
        } catch (error: unknown) {
          await this.defer(job.id, job.attempts + 1);
          this.logger.warn(`Ticket transfer resolution failed (${error instanceof Error ? error.name : 'unknown'}).`);
        }
      }
    } catch (error: unknown) {
      this.logger.warn(`Ticket transfer resolution polling failed (${error instanceof Error ? error.name : 'unknown'}).`);
    } finally {
      this.running = false;
    }
  }

  private async resolve(transferId: string, jobId: string): Promise<void> {
    const transfer = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      this.prisma.ticketTransfer.findUnique({
        where: { id: transferId },
        include: {
          ticket: { include: { ticketConfig: true, event: { include: { eventGroup: true } }, holder: true } },
          event: { include: { eventGroup: true } },
          sender: true,
        },
      }),
    );
    if (
      !transfer ||
      transfer.initiatorType !== 'HOLDER' ||
      transfer.senderStatus !== TicketTransferSenderStatus.PENDING ||
      transfer.recipientStatus !== TicketTransferRecipientStatus.PENDING ||
      !transfer.submittedDestinationIdentityDocumentEncrypted
    ) {
      await this.complete(jobId);
      return;
    }

    const rawDocument = this.revealDestination(transfer.submittedDestinationIdentityDocumentEncrypted);
    const normalizedDocument = rawDocument ? normalizeIdentityDocumentForLookup(rawDocument) : '';
    const recipient = normalizedDocument
      ? await this.resolveRecipient(normalizedDocument)
      : null;
    const identitySnapshot = recipient?.userId
      ? await this.eligibility.prepareIdentitySnapshot(transfer.eventId, recipient.personId, 'recipient')
      : undefined;

    await runSerializablePrismaTransaction(this.prisma, async (tx) =>
      audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
        await this.lockTicket(tx, transfer.ticketId);
        await lockEventTicketExpiration(tx, transfer.eventId, 'SHARE');
        const current = await tx.ticketTransfer.findUnique({
          where: { id: transferId },
          include: {
            ticket: { include: { ticketConfig: true, event: { include: { eventGroup: true } } } },
            event: { include: { eventGroup: true } },
            sender: true,
            recipient: true,
            author: true,
            initiatingAdmin: true,
          },
        });
        if (
          !current ||
          current.senderStatus !== TicketTransferSenderStatus.PENDING ||
          current.recipientStatus !== TicketTransferRecipientStatus.PENDING ||
          !current.submittedDestinationIdentityDocumentEncrypted
        ) {
          await tx.ticketTransferResolutionOutbox.updateMany({
            where: { id: jobId, completedAt: null },
            data: { completedAt: new Date(), leaseUntil: null, lastError: null },
          });
          return;
        }

        const ticket = current.ticket;
        const now = new Date();
        if (
          ticket.status !== EventTicketStatus.ACTIVE ||
          ticket.expiresAt <= now ||
          ticket.holderPersonId !== current.senderPersonId ||
          !ticket.ticketConfig.enabled ||
          !ticket.ticketConfig.transferable
        ) {
          await tx.ticketTransfer.updateMany({
            where: { id: current.id, senderStatus: TicketTransferSenderStatus.PENDING },
            data: {
              senderStatus: TicketTransferSenderStatus.EXPIRED,
              submittedDestinationIdentityDocumentEncrypted: null,
            },
          });
          await recordTicketAudit(tx, {
            entityType: AuditLogEntityType.TICKET_TRANSFER,
            entityId: current.id,
            entityLabel: ticket.ticketConfig.displayName ?? current.event.name,
            operation: AuditLogOperation.UPDATE,
            summary: 'Solicitação de transferência expirada antes da análise.',
            actorName: 'Sistema de bilhetes',
            permission: Permission.TicketTransfer.Manage,
            eventId: current.eventId,
            majorEventId: current.event.majorEventId ?? current.event.eventGroup?.majorEventId,
            before: { senderStatus: current.senderStatus },
            after: { senderStatus: TicketTransferSenderStatus.EXPIRED },
          });
          await this.completeInTransaction(tx, jobId);
          await this.realtime.enqueueForUsers(tx, [current.authorUserId, current.senderUserId], {
            type: 'TRANSFERS_CHANGED',
            eventId: current.eventId,
            ticketId: current.ticketId,
            transferId: current.id,
          });
          return;
        }

        const resolvedRecipient = recipient
          ? await tx.people.findFirst({
              where: { id: recipient.personId, deletedAt: null, mergedIntoId: null },
              select: {
                id: true,
                userId: true,
                name: true,
                identityDocument: true,
                user: { select: { id: true, identityDocument: true } },
              },
            })
          : null;
        const currentRecipient = resolvedRecipient && [
          resolvedRecipient.identityDocument,
          resolvedRecipient.user?.identityDocument,
        ].some((document) => normalizeIdentityDocumentForLookup(document ?? '') === normalizedDocument)
          ? resolvedRecipient
          : null;
        if (currentRecipient) await this.lockHolder(tx, current.eventId, currentRecipient.id);
        const hasUser = Boolean(currentRecipient?.userId && identitySnapshot?.userId === currentRecipient.userId);
        const duplicate = currentRecipient
          ? await tx.eventTicket.findFirst({
              where: {
                eventId: current.eventId,
                holderPersonId: currentRecipient.id,
                status: { in: [EventTicketStatus.ACTIVE, EventTicketStatus.CONSUMED] },
              },
              select: { id: true },
            })
          : null;
        const eligibility = hasUser && currentRecipient
          ? await this.eligibility.evaluateRecipientEligibility(
              tx,
              current.eventId,
              currentRecipient.id,
              identitySnapshot,
            )
          : null;

        const classification = classifyRecipientResolution({
          personFound: Boolean(currentRecipient),
          hasUserAccount: hasUser,
          alreadyHoldsTicket: Boolean(duplicate),
          eligible: Boolean(eligibility?.eligible),
        });
        const recipientStatus = classification.status;
        const ignoreReason = classification.ignoreReason;
        const changed = await tx.ticketTransfer.updateMany({
          where: {
            id: current.id,
            senderStatus: TicketTransferSenderStatus.PENDING,
            recipientStatus: TicketTransferRecipientStatus.PENDING,
          },
          data: {
            recipientPersonId: currentRecipient?.id ?? null,
            recipientUserId: hasUser ? currentRecipient?.userId ?? null : null,
            recipientStatus,
            ignoreReason,
            ignoredAt: recipientStatus === TicketTransferRecipientStatus.PENDING ? null : now,
          },
        });
        if (changed.count !== 1) {
          await this.completeInTransaction(tx, jobId);
          return;
        }

        if (ignoreReason) {
          await tx.eventTicketHistory.create({
            data: {
              ticketId: current.ticketId,
              transferId: current.id,
              operation: TicketHistoryOperation.TRANSFER_IGNORED,
              previousHolderPersonId: current.senderPersonId,
              newHolderPersonId: currentRecipient?.id ?? null,
              reason: ignoreReason,
            },
          });
        }
        await recordTicketAudit(tx, {
          entityType: AuditLogEntityType.TICKET_TRANSFER,
          entityId: current.id,
          entityLabel: ticket.ticketConfig.displayName ?? current.event.name,
          operation: AuditLogOperation.UPDATE,
          summary: ignoreReason
            ? 'Solicitação de transferência classificada pelos critérios do bilhete.'
            : 'Destinatário elegível vinculado à solicitação de transferência.',
          actorName: 'Sistema de bilhetes',
          permission: null,
          eventId: current.eventId,
          majorEventId: current.event.majorEventId ?? current.event.eventGroup?.majorEventId,
          before: { recipientStatus: TicketTransferRecipientStatus.PENDING },
          after: { recipientStatus, ignoreReason },
        });
        if (classification.notifyRecipient && hasUser && currentRecipient?.userId) {
          const notificationType = recipientStatus === TicketTransferRecipientStatus.PENDING
            ? TicketNotificationType.RECIPIENT_REQUESTED
            : TicketNotificationType.RECIPIENT_INELIGIBLE;
          await tx.ticketNotificationOutbox.create({
            data: {
              transferId: current.id,
              notificationType,
              recipientUserId: currentRecipient.userId,
              ticketName: ticket.ticketConfig.displayName ?? current.event.name,
              eventName: current.event.name,
              actorFirstName: firstName(current.sender?.name),
              actionUrl: `/profile/wallet/ticket-transfers/${current.id}`,
            },
          });
        }
        await this.completeInTransaction(tx, jobId);
        if (hasUser && currentRecipient?.userId) {
          await this.realtime.enqueueForUsers(tx, [currentRecipient.userId], {
            type: 'TRANSFERS_CHANGED',
            eventId: current.eventId,
            ticketId: current.ticketId,
            transferId: current.id,
          });
        }
      }),
    );
  }

  private revealDestination(ciphertext: string): string | null {
    try {
      return this.identities.reveal(SportsIdentityType.IDENTITY_DOCUMENT, ciphertext);
    } catch {
      return null;
    }
  }

  private async resolveRecipient(normalizedDocument: string): Promise<{ personId: string; userId: string | null } | null> {
    const personMatches = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      this.findPeopleByDocument(this.prisma, normalizedDocument),
    );
    if (personMatches.length > 0) {
      return audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
        const person = await this.resolveCanonicalPerson(this.prisma, personMatches);
        return person?.userId ? { personId: person.id, userId: person.userId } : null;
      });
    }

    const userMatches = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM users
        WHERE "identityDocument" IS NOT NULL
          AND regexp_replace(upper("identityDocument"), '[^[:alnum:]]', '', 'g') = ${normalizedDocument}
        ORDER BY id
        LIMIT 2
      `,
    );
    if (userMatches.length !== 1) return null;
    const person = await this.ensureLocalUserPerson(userMatches[0].id, normalizedDocument);
    return person?.userId ? { personId: person.id, userId: person.userId } : null;
  }

  private async findPeopleByDocument(
    tx: Prisma.TransactionClient | PrismaService,
    normalizedDocument: string,
  ): Promise<Array<{ id: string; mergedIntoId: string | null }>> {
    return tx.$queryRaw<Array<{ id: string; mergedIntoId: string | null }>>`
      SELECT id, "mergedIntoId"
      FROM people
      WHERE "deletedAt" IS NULL
        AND regexp_replace(upper(coalesce("identityDocument", '')), '[^[:alnum:]]', '', 'g') = ${normalizedDocument}
      ORDER BY "mergedIntoId" NULLS FIRST, "createdAt" ASC
    `;
  }

  private async resolveCanonicalPerson(
    tx: Prisma.TransactionClient | PrismaService,
    matches: Array<{ id: string; mergedIntoId: string | null }>,
  ): Promise<{ id: string; userId: string | null } | null> {
    const canonicalIds = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH RECURSIVE person_chain AS (
        SELECT id, "mergedIntoId"
        FROM people
        WHERE id IN (${Prisma.join(matches.map(({ id }) => id))})
          AND "deletedAt" IS NULL
        UNION ALL
        SELECT parent.id, parent."mergedIntoId"
        FROM people parent
        JOIN person_chain child ON parent.id = child."mergedIntoId"
        WHERE parent."deletedAt" IS NULL
      )
      SELECT DISTINCT id
      FROM person_chain
      WHERE "mergedIntoId" IS NULL
    `);
    if (canonicalIds.length !== 1) return null;
    return tx.people.findFirst({
      where: { id: canonicalIds[0].id, deletedAt: null, mergedIntoId: null },
      select: { id: true, userId: true },
    });
  }

  /** Lazily materializes the same kc:<userId> person row used by current-user context. */
  private async ensureLocalUserPerson(
    userId: string,
    normalizedDocument: string,
  ): Promise<{ id: string; userId: string | null } | null> {
    return runSerializablePrismaTransaction(this.prisma, async (tx) =>
      audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
        const lockKey = `ticket-recipient-document:${normalizedDocument}`;
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, email: true, identityDocument: true, academicId: true },
        });
        if (!user || normalizeIdentityDocumentForLookup(user.identityDocument ?? '') !== normalizedDocument) return null;

        const existingMatches = await this.findPeopleByDocument(tx, normalizedDocument);
        if (existingMatches.length > 0) {
          const existing = await this.resolveCanonicalPerson(tx, existingMatches);
          return existing?.userId === user.id ? existing : null;
        }

        const externalRef = `kc:${user.id}`;
        const linkedPerson = await tx.people.findUnique({
          where: { externalRef },
          select: { id: true, name: true, email: true, identityDocument: true, isCPF: true, academicId: true, userId: true, deletedAt: true, mergedIntoId: true },
        });
        if (linkedPerson) {
          if (
            linkedPerson.deletedAt ||
            linkedPerson.mergedIntoId ||
            (linkedPerson.userId && linkedPerson.userId !== user.id)
          ) {
            return null;
          }
          const updated = await tx.people.update({
            where: { id: linkedPerson.id },
            data: {
              userId: user.id,
              ...(linkedPerson.email ? {} : { email: user.email }),
              ...(linkedPerson.identityDocument
                ? {}
                : { identityDocument: user.identityDocument, isCPF: isValidCPF(user.identityDocument ?? '') }),
              ...(linkedPerson.academicId ? {} : { academicId: user.academicId }),
            },
            select: { id: true, userId: true },
          });
          return updated;
        }

        const person = await tx.people.upsert({
          where: { externalRef },
          create: {
            name: user.name,
            email: user.email,
            secondaryEmails: [],
            identityDocument: user.identityDocument,
            isCPF: isValidCPF(user.identityDocument ?? ''),
            academicId: user.academicId,
            userId: user.id,
            externalRef,
          },
          update: { userId: user.id },
          select: { id: true, userId: true, deletedAt: true, mergedIntoId: true },
        });
        if (person.deletedAt || person.mergedIntoId) return null;
        return { id: person.id, userId: person.userId };
      }),
    );
  }

  private async complete(jobId: string): Promise<void> {
    await this.prisma.ticketTransferResolutionOutbox.updateMany({
      where: { id: jobId, completedAt: null },
      data: { completedAt: new Date(), leaseUntil: null, lastError: null },
    });
  }

  private async completeInTransaction(tx: Prisma.TransactionClient, jobId: string): Promise<void> {
    await tx.ticketTransferResolutionOutbox.updateMany({
      where: { id: jobId, completedAt: null },
      data: { completedAt: new Date(), leaseUntil: null, lastError: null },
    });
  }

  private async defer(jobId: string, attempts: number): Promise<void> {
    const delaySeconds = Math.min(60 * 60, 2 ** Math.min(attempts, 12));
    await this.prisma.ticketTransferResolutionOutbox.updateMany({
      where: { id: jobId, completedAt: null },
      data: {
        attempts,
        nextAttemptAt: new Date(Date.now() + delaySeconds * 1_000),
        leaseUntil: null,
        lastError: 'Destination resolution failed.',
      },
    });
  }

  private async lockTicket(tx: Prisma.TransactionClient, ticketId: string): Promise<void> {
    const key = `ticket-transfer:${ticketId}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }

  private async lockHolder(tx: Prisma.TransactionClient, eventId: string, personId: string): Promise<void> {
    const key = `ticket-holder:${eventId}:${personId}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }
}

function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/u)[0] ?? 'Alguém';
}
