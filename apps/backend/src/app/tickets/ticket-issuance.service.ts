import { ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  EventTicketIssueSource,
  EventTicketStatus,
  Prisma,
  TicketExpirationMode,
  TicketHistoryOperation,
  TicketEntitlementReconciliationPhase,
} from '@prisma/client';
import { audienceContext } from '../audiences/audience-context';
import { ANONYMOUS_AUDIENCE } from '../audiences/audience-context';
import { runSerializablePrismaTransaction } from '../common/serializable-prisma-transaction';
import { PrismaService } from '../prisma/prisma.service';
import { Permission } from '@cacic-fct/shared-permissions';
import { TicketRealtimeService } from './ticket-realtime.service';
import { recordTicketAudit } from './ticket-audit';
import { lockEventTicketExpiration } from './ticket-expiration-lock';
import type { TicketExpirationRowLockMode } from './ticket-expiration-lock';

export type { TicketExpirationRowLockMode } from './ticket-expiration-lock';

const MAX_RECONCILIATION_PAGE_SIZE = 200;
const AUTOMATIC_TICKET_SOURCES = [
  EventTicketIssueSource.EVENT_SUBSCRIPTION,
  EventTicketIssueSource.MAJOR_EVENT_SUBSCRIPTION,
] as const;

export type AutomaticTicketSource = (typeof AUTOMATIC_TICKET_SOURCES)[number];

export type ConsumeTicketOptions = {
  actorUserId?: string;
  attendedAt?: Date;
};

export type IssueTicketOptions = {
  actorUserId?: string | null;
  reason?: string | null;
  /** Internal: syncForPerson already acquired the event's shared expiry lock. */
  eventExpiryLockHeld?: boolean;
  /** Internal: the entitlement was already valid at this explicit scan/backfill time. */
  issuedAt?: Date;
};

export type TicketSyncOptions = {
  /** Reconciliation job creation time defines which existing subscriptions and attendances it backfills. */
  reconciliationCreatedAt?: Date;
  /** A PRESENT scan may materialize only an entitlement that already qualified at this time. */
  eligibleAt?: Date;
};

export type TicketExpirationAlignmentScope = 'ALL_ACTIVE' | 'EVENT_END_ONLY';
export type TicketExpirationAlignmentOptions = {
  scope: TicketExpirationAlignmentScope;
  actorUserId?: string | null;
  permission?: string | null;
  enqueueInvalidations?: boolean;
};

type TicketEventEntitlementContext = {
  id: string;
  name: string;
  endDate: Date;
  deletedAt: Date | null;
  majorEventId: string | null;
  eventGroup: {
    majorEventId: string | null;
    majorEvent: { isPaymentRequired: boolean } | null;
  } | null;
  majorEvent: { isPaymentRequired: boolean } | null;
  ticketConfig: {
    id: string;
    enabled: boolean;
    displayName: string | null;
    issueOnEventSubscription: boolean;
    issueOnMajorEventSubscription: boolean;
    includedPriceTierIds: string[];
    expirationMode: 'EVENT_END' | 'CUSTOM';
    customExpiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

type HistoricalAttendanceProof = {
  attendedAt: Date;
  committedById: string | null;
  createdById: string | null;
};

@Injectable()
export class TicketIssuanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketIssuanceService.name);
  private reconciliationTimer?: NodeJS.Timeout;
  private reconciling = false;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: TicketRealtimeService,
  ) {}

  onModuleInit(): void {
    this.reconciliationTimer = setInterval(() => void this.processReconciliationJobs(), 2_000);
    this.reconciliationTimer.unref();
    void this.processReconciliationJobs();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
  }

  async issueForPerson(
    tx: Prisma.TransactionClient,
    eventId: string,
    personId: string,
    source: EventTicketIssueSource,
    sourceKey?: string | null,
    options: IssueTicketOptions = {},
  ) {
    return audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
      const expectedKey = sourceKey ?? null;
      if (!options.eventExpiryLockHeld) await this.lockEventExpirationAlignment(tx, eventId, 'SHARE');
      await this.lockHolder(tx, eventId, personId);

      const event = await this.requireEvent(tx, eventId);
      const config = event.ticketConfig;
      if (!config?.enabled || event.deletedAt) throw new NotFoundException('Este evento não possui bilhetes ativos.');

      const expiresAt = this.resolveExpiration(event);
      const issuedAt = options.issuedAt ?? new Date();
      if (source !== EventTicketIssueSource.ADMIN && !options.issuedAt && expiresAt <= issuedAt) {
        throw new ConflictException('O prazo deste bilhete já terminou.');
      }

      const holder = await tx.people.findFirst({
        where: { id: personId, deletedAt: null, mergedIntoId: null },
        select: { id: true, userId: true },
      });
      if (!holder) throw new NotFoundException('Pessoa não encontrada.');

      if (expectedKey) {
        const existingFromSource = await tx.eventTicket.findUnique({ where: { sourceKey: expectedKey } });
        if (existingFromSource) return existingFromSource;
      }

      const alreadyHoldsTicket = await tx.eventTicket.findFirst({
        where: {
          eventId,
          holderPersonId: personId,
          status: { in: [EventTicketStatus.ACTIVE, EventTicketStatus.CONSUMED] },
        },
      });
      if (alreadyHoldsTicket) {
        if (source === EventTicketIssueSource.ADMIN) {
          throw new ConflictException('A pessoa já possui um bilhete para este evento.');
        }
        return alreadyHoldsTicket;
      }

      const ticket = await tx.eventTicket.create({
        data: {
          eventId,
          ticketConfigId: config.id,
          holderPersonId: holder.id,
          originalHolderPersonId: holder.id,
          source,
          sourceKey: expectedKey,
          status: EventTicketStatus.ACTIVE,
          issuedAt,
          expiresAt,
        },
      });

      await tx.eventTicketHistory.create({
        data: {
          ticketId: ticket.id,
          operation: TicketHistoryOperation.ISSUED,
          newHolderPersonId: holder.id,
          actorUserId: options.actorUserId ?? null,
          reason: this.safeReason(options.reason),
        },
      });

      await recordTicketAudit(tx, {
        entityType: AuditLogEntityType.TICKET,
        entityId: ticket.id,
        entityLabel: config.displayName ?? event.name,
        operation: AuditLogOperation.ISSUE,
        summary: 'Bilhete emitido.',
        actorUserId: options.actorUserId,
        actorName: options.actorUserId ? undefined : 'Sistema de bilhetes',
        permission: source === EventTicketIssueSource.ADMIN ? Permission.Ticket.Issue : null,
        eventId,
        majorEventId: event.majorEventId ?? event.eventGroup?.majorEventId,
        after: {
          status: EventTicketStatus.ACTIVE,
          eventId,
          holderPersonId: holder.id,
          source,
          sourceKey: expectedKey,
          issuedAt: ticket.issuedAt.toISOString(),
        },
        metadata: { reason: this.safeReason(options.reason) },
      });

      await this.realtime.enqueueForUsers(tx, [holder.userId], {
        type: 'TICKETS_CHANGED',
        eventId,
        ticketId: ticket.id,
      });
      return ticket;
    });
  }

  /** Synchronizes one deterministic subscription entitlement without creating a replacement after transfer. */
  async syncForPerson(
    tx: Prisma.TransactionClient,
    eventId: string,
    personId: string,
    source: AutomaticTicketSource,
    sourceKey: string,
    options: TicketSyncOptions = {},
  ): Promise<void> {
    if (options.eligibleAt) {
      await this.syncAutomaticSourceAtAttendance(tx, eventId, personId, source, sourceKey, options.eligibleAt);
      return;
    }

    await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
      const expectedKey = this.subscriptionSourceKey(eventId, personId, source);
      if (sourceKey !== expectedKey) throw new ConflictException('A origem de emissão do bilhete é inválida.');

      await this.lockEventExpirationAlignment(tx, eventId, 'SHARE');
      await this.lockHolder(tx, eventId, personId);
      const event = await this.requireEvent(tx, eventId);
      const config = event.ticketConfig;
      const reconciliationCreatedAt = options.reconciliationCreatedAt;
      if (reconciliationCreatedAt && (
        !config?.enabled ||
        config.createdAt > reconciliationCreatedAt ||
        config.updatedAt > reconciliationCreatedAt
      )) return;
      const sourceEligible = await this.sourceSubscriptionIsEligible(
        tx,
        event,
        personId,
        source,
        reconciliationCreatedAt,
      );

      if (!sourceEligible) {
        if (reconciliationCreatedAt) return;
        const otherSource = source === EventTicketIssueSource.EVENT_SUBSCRIPTION
          ? EventTicketIssueSource.MAJOR_EVENT_SUBSCRIPTION
          : EventTicketIssueSource.EVENT_SUBSCRIPTION;
        if (await this.automaticEntitlementIsEligible(tx, event, personId, otherSource)) return;
        await this.revokeSubscriptionTicket(tx, event, personId, source, expectedKey);
        return;
      }

      if (!config?.enabled) return;
      const sourceEnabled = source === EventTicketIssueSource.EVENT_SUBSCRIPTION
        ? config.issueOnEventSubscription
        : config.issueOnMajorEventSubscription;
      if (!sourceEnabled) return;
      if (!(await this.includedPriceTierAllows(
        tx,
        event,
        personId,
        source,
        config.includedPriceTierIds,
        reconciliationCreatedAt,
      ))) {
        if (reconciliationCreatedAt) return;
        const otherSource = source === EventTicketIssueSource.EVENT_SUBSCRIPTION
          ? EventTicketIssueSource.MAJOR_EVENT_SUBSCRIPTION
          : EventTicketIssueSource.EVENT_SUBSCRIPTION;
        if (await this.automaticEntitlementIsEligible(tx, event, personId, otherSource)) return;
        await this.revokeSubscriptionTicket(tx, event, personId, source, expectedKey);
        return;
      }

      const lineagePersonIds = await this.personLineageIds(tx, personId);
      const transferredAutomaticRight = await tx.eventTicket.findFirst({
        where: {
          eventId,
          originalHolderPersonId: { in: lineagePersonIds },
          source: { in: [...AUTOMATIC_TICKET_SOURCES] },
          history: { some: { operation: TicketHistoryOperation.TRANSFERRED } },
        },
        select: { id: true },
      });
      if (transferredAutomaticRight) return;

      const priorAttendance = reconciliationCreatedAt
        ? await this.findHistoricalAttendance(tx, eventId, personId, reconciliationCreatedAt)
        : null;

      const exactSourceTicket = await tx.eventTicket.findUnique({ where: { sourceKey: expectedKey } });
      const existingFromSource = exactSourceTicket ?? await tx.eventTicket.findFirst({
        where: {
          eventId,
          originalHolderPersonId: { in: lineagePersonIds },
          source,
          sourceKey: { not: expectedKey },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (existingFromSource) {
        if (reconciliationCreatedAt && priorAttendance) {
          if (
            existingFromSource.status === EventTicketStatus.ACTIVE &&
            existingFromSource.holderPersonId === personId
          ) {
            await this.redeemBackfilledAttendance(tx, event, personId, existingFromSource, priorAttendance);
          }
          return;
        }
        const reactivationExpiresAt = this.resolveExpiration(event);
        const reactivatedAt = new Date();
        if (
          existingFromSource.status === EventTicketStatus.REVOKED &&
          existingFromSource.revokedReason?.startsWith('SUBSCRIPTION_') &&
          reactivationExpiresAt > reactivatedAt &&
          existingFromSource.holderPersonId === personId &&
          !(await tx.eventTicketHistory.findFirst({
            where: { ticketId: existingFromSource.id, operation: TicketHistoryOperation.TRANSFERRED },
            select: { id: true },
          }))
        ) {
          const restored = await tx.eventTicket.updateMany({
            where: {
              id: existingFromSource.id,
              eventId,
              holderPersonId: personId,
              status: EventTicketStatus.REVOKED,
              revokedReason: existingFromSource.revokedReason,
              expiresAt: existingFromSource.expiresAt,
              issuedAt: existingFromSource.issuedAt,
            },
            data: {
              status: EventTicketStatus.ACTIVE,
              revokedAt: null,
              revokedReason: null,
              issuedAt: reactivatedAt,
              expiresAt: reactivationExpiresAt,
            },
          });
          if (restored.count === 1) {
            await tx.eventTicketHistory.create({
              data: {
                ticketId: existingFromSource.id,
                operation: TicketHistoryOperation.ISSUED,
                newHolderPersonId: personId,
                reason: 'Direito reativado após revalidação da inscrição.',
              },
            });
            await recordTicketAudit(tx, {
              entityType: AuditLogEntityType.TICKET,
              entityId: existingFromSource.id,
              entityLabel: config.displayName ?? event.name,
              operation: AuditLogOperation.REISSUE,
              summary: 'Bilhete reativado após revalidação da inscrição.',
              actorName: 'Sistema de inscrições',
              eventId,
              majorEventId: event.majorEventId ?? event.eventGroup?.majorEventId,
              before: {
                status: EventTicketStatus.REVOKED,
                holderPersonId: personId,
                issuedAt: existingFromSource.issuedAt.toISOString(),
                expiresAt: existingFromSource.expiresAt.toISOString(),
              },
              after: {
                status: EventTicketStatus.ACTIVE,
                holderPersonId: personId,
                issuedAt: reactivatedAt.toISOString(),
                expiresAt: reactivationExpiresAt.toISOString(),
              },
            });
            await this.realtime.enqueueForUsers(tx, [await this.userIdForPerson(tx, personId)], {
              type: 'TICKETS_CHANGED',
              eventId,
              ticketId: existingFromSource.id,
            });
          }
        }
        return;
      }

      const otherOwnedTicket = await tx.eventTicket.findFirst({
        where: { eventId, holderPersonId: personId, status: { in: [EventTicketStatus.ACTIVE, EventTicketStatus.CONSUMED] } },
        select: { id: true, status: true, holderPersonId: true, issuedAt: true },
      });
      if (otherOwnedTicket) return;
      const expiresAt = this.resolveExpiration(event);
      if (!priorAttendance && expiresAt <= new Date()) return;
      const ticket = await this.issueForPerson(tx, eventId, personId, source, expectedKey, {
        eventExpiryLockHeld: true,
        ...(priorAttendance ? { issuedAt: priorAttendance.attendedAt } : {}),
      });
      if (priorAttendance && ticket.status === EventTicketStatus.ACTIVE) {
        await this.redeemBackfilledAttendance(tx, event, personId, ticket, priorAttendance);
      }
    });
  }

  /** Materializes a missing auto-issued right only when its source existed by the scan time. */
  async syncForAttendance(
    tx: Prisma.TransactionClient,
    eventId: string,
    personId: string,
    attendedAt: Date,
  ): Promise<void> {
    if (!Number.isFinite(attendedAt.getTime())) return;
    const processedAt = new Date();
    const eligibleAt = attendedAt.getTime() < processedAt.getTime() ? attendedAt : processedAt;
    for (const source of AUTOMATIC_TICKET_SOURCES) {
      await this.syncForPerson(
        tx,
        eventId,
        personId,
        source,
        this.subscriptionSourceKey(eventId, personId, source),
        { eligibleAt },
      );
    }
  }

  private async syncAutomaticSourceAtAttendance(
    tx: Prisma.TransactionClient,
    eventId: string,
    personId: string,
    source: AutomaticTicketSource,
    sourceKey: string,
    attendedAt: Date,
  ): Promise<void> {
    await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
      const expectedKey = this.subscriptionSourceKey(eventId, personId, source);
      if (sourceKey !== expectedKey) throw new ConflictException('A origem de emissão do bilhete é inválida.');

      await this.lockEventExpirationAlignment(tx, eventId, 'SHARE');
      await this.lockHolder(tx, eventId, personId);
      const event = await this.requireEvent(tx, eventId);
      const config = event.ticketConfig;
      if (
        !config?.enabled ||
        event.deletedAt ||
        config.createdAt > attendedAt ||
        config.updatedAt > attendedAt
      ) return;

      const sourceEnabled = source === EventTicketIssueSource.EVENT_SUBSCRIPTION
        ? config.issueOnEventSubscription
        : config.issueOnMajorEventSubscription;
      if (!sourceEnabled) return;
      if (!(await this.sourceSubscriptionIsEligible(tx, event, personId, source, attendedAt))) return;
      if (!(await this.includedPriceTierAllows(tx, event, personId, source, config.includedPriceTierIds, attendedAt))) return;

      const lineagePersonIds = await this.personLineageIds(tx, personId);
      const transferredAutomaticRight = await tx.eventTicket.findFirst({
        where: {
          eventId,
          originalHolderPersonId: { in: lineagePersonIds },
          source: { in: [...AUTOMATIC_TICKET_SOURCES] },
          history: { some: { operation: TicketHistoryOperation.TRANSFERRED } },
        },
        select: { id: true },
      });
      if (transferredAutomaticRight) return;

      const exactSourceTicket = await tx.eventTicket.findUnique({ where: { sourceKey: expectedKey } });
      const existingFromSource = exactSourceTicket ?? await tx.eventTicket.findFirst({
        where: {
          eventId,
          originalHolderPersonId: { in: lineagePersonIds },
          source,
          sourceKey: { not: expectedKey },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (existingFromSource) {
      if (
        existingFromSource.status === EventTicketStatus.ACTIVE &&
        existingFromSource.holderPersonId === personId &&
        existingFromSource.issuedAt > attendedAt
      ) {
        if (!(await this.hasRevocationHistory(tx, existingFromSource.id))) {
          await this.alignTicketIssuedAtForAttendance(tx, event, personId, existingFromSource, attendedAt, 'ATTENDANCE');
        }
      }
        return;
      }

      const otherOwnedTicket = await tx.eventTicket.findFirst({
        where: {
          eventId,
          holderPersonId: personId,
          status: { in: [EventTicketStatus.ACTIVE, EventTicketStatus.CONSUMED] },
        },
        select: { id: true },
      });
      if (otherOwnedTicket) return;

      await this.issueForPerson(tx, eventId, personId, source, expectedKey, {
        eventExpiryLockHeld: true,
        issuedAt: attendedAt,
      });
    });
  }

  private async findHistoricalAttendance(
    tx: Prisma.TransactionClient,
    eventId: string,
    personId: string,
    reconciliationCreatedAt: Date,
  ): Promise<HistoricalAttendanceProof | null> {
    const attendance = await tx.eventAttendance.findUnique({
      where: { personId_eventId: { personId, eventId } },
      select: { status: true, attendedAt: true, committedById: true, createdById: true },
    });
    if (
      !attendance ||
      attendance.status !== 'PRESENT' ||
      attendance.attendedAt > reconciliationCreatedAt
    ) return null;
    return {
      attendedAt: attendance.attendedAt,
      committedById: attendance.committedById,
      createdById: attendance.createdById,
    };
  }

  private async redeemBackfilledAttendance(
    tx: Prisma.TransactionClient,
    event: TicketEventEntitlementContext,
    personId: string,
    ticket: { id: string; holderPersonId: string | null; status: EventTicketStatus; issuedAt: Date; expiresAt: Date },
    attendance: HistoricalAttendanceProof,
  ): Promise<void> {
    if (
      ticket.status !== EventTicketStatus.ACTIVE ||
      ticket.holderPersonId !== personId
    ) return;
    const transferred = await tx.eventTicketHistory.findFirst({
      where: { ticketId: ticket.id, operation: TicketHistoryOperation.TRANSFERRED },
      select: { id: true },
    });
    if (transferred) return;
    if (ticket.issuedAt > attendance.attendedAt && await this.hasRevocationHistory(tx, ticket.id)) return;

    await this.alignTicketIssuedAtForAttendance(tx, event, personId, ticket, attendance.attendedAt, 'BACKFILL');
    const consumed = await this.consumeForAttendance(tx, event.id, personId, {
      attendedAt: attendance.attendedAt,
      actorUserId: attendance.committedById ?? attendance.createdById ?? undefined,
    });
    if (!consumed) throw new ConflictException('Não foi possível associar o bilhete à presença registrada.');
  }

  private async alignTicketIssuedAtForAttendance(
    tx: Prisma.TransactionClient,
    event: TicketEventEntitlementContext,
    personId: string,
    ticket: { id: string; holderPersonId: string | null; status: EventTicketStatus; issuedAt: Date },
    attendedAt: Date,
    context: 'ATTENDANCE' | 'BACKFILL',
  ): Promise<void> {
    if (ticket.issuedAt <= attendedAt) return;
    const processedAt = new Date();
    const updated = await tx.eventTicket.updateMany({
      where: {
        id: ticket.id,
        holderPersonId: personId,
        status: EventTicketStatus.ACTIVE,
        issuedAt: ticket.issuedAt,
      },
      data: { issuedAt: attendedAt },
    });
    if (updated.count !== 1) throw new ConflictException('O bilhete mudou durante a reconciliação da presença.');

    await recordTicketAudit(tx, {
      entityType: AuditLogEntityType.TICKET,
      entityId: ticket.id,
      entityLabel: event.ticketConfig?.displayName ?? event.name,
      operation: AuditLogOperation.UPDATE,
      summary: context === 'BACKFILL'
        ? 'Emissão do bilhete alinhada à presença anterior à ativação dos bilhetes.'
        : 'Emissão do bilhete alinhada à elegibilidade comprovada durante a presença.',
      actorName: context === 'BACKFILL' ? 'Sistema de reconciliação de bilhetes' : 'Sistema de presença',
      eventId: event.id,
      majorEventId: event.majorEventId ?? event.eventGroup?.majorEventId,
      before: { status: EventTicketStatus.ACTIVE, holderPersonId: personId, issuedAt: ticket.issuedAt.toISOString() },
      after: { status: EventTicketStatus.ACTIVE, holderPersonId: personId, issuedAt: attendedAt.toISOString() },
      metadata: { reconciliationContext: context, attendedAt: attendedAt.toISOString(), processedAt: processedAt.toISOString() },
    });
  }

  private async hasRevocationHistory(tx: Prisma.TransactionClient, ticketId: string): Promise<boolean> {
    return Boolean(await tx.eventTicketHistory.findFirst({
      where: { ticketId, operation: TicketHistoryOperation.REVOKED },
      select: { id: true },
    }));
  }

  /** Expiration is advisory; redemption still requires an unused ticket owned at attendance time. */
  async consumeForAttendance(
    tx: Prisma.TransactionClient,
    eventId: string,
    personId: string,
    options: ConsumeTicketOptions = {},
  ): Promise<boolean> {
    return audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
      await this.lockEventExpirationAlignment(tx, eventId, 'SHARE');
      const processedAt = new Date();
      if (options.attendedAt && !Number.isFinite(options.attendedAt.getTime())) return false;
      const effectiveAt = options.attendedAt && options.attendedAt.getTime() < processedAt.getTime()
        ? options.attendedAt
        : processedAt;
      const ticket = await tx.eventTicket.findFirst({
        where: {
          eventId,
          holderPersonId: personId,
          status: EventTicketStatus.ACTIVE,
          issuedAt: { lte: effectiveAt },
          transfers: {
            none: {
              senderStatus: 'ACCEPTED',
              recipientStatus: 'ACCEPTED',
              acceptedAt: { gt: effectiveAt },
            },
          },
          event: { deletedAt: null, ticketConfig: { is: { enabled: true } } },
          holder: { deletedAt: null, mergedIntoId: null },
        },
        include: {
          event: {
            select: {
              name: true,
              majorEventId: true,
              eventGroup: { select: { majorEventId: true } },
              ticketConfig: { select: { displayName: true } },
            },
          },
          holder: { select: { userId: true } },
        },
      });
      if (!ticket) return false;

      const changed = await tx.eventTicket.updateMany({
        where: {
          id: ticket.id,
          eventId,
          holderPersonId: personId,
          status: EventTicketStatus.ACTIVE,
          issuedAt: { lte: effectiveAt },
          transfers: {
            none: {
              senderStatus: 'ACCEPTED',
              recipientStatus: 'ACCEPTED',
              acceptedAt: { gt: effectiveAt },
            },
          },
        },
        data: {
          status: EventTicketStatus.CONSUMED,
          consumedAt: effectiveAt,
          consumedByPersonId: personId,
        },
      });
      if (changed.count !== 1) return false;

      await tx.eventTicketHistory.create({
        data: {
          ticketId: ticket.id,
          operation: TicketHistoryOperation.CONSUMED,
          previousHolderPersonId: personId,
          newHolderPersonId: personId,
          actorUserId: options.actorUserId ?? null,
        },
      });
      await recordTicketAudit(tx, {
        entityType: AuditLogEntityType.TICKET,
        entityId: ticket.id,
        entityLabel: ticket.event.ticketConfig?.displayName ?? ticket.event.name,
        operation: AuditLogOperation.SCAN,
        summary: 'Bilhete validado durante o registro de presença.',
        actorUserId: options.actorUserId,
        actorName: options.actorUserId ? undefined : 'Sistema de presença',
        permission: null,
        eventId,
        majorEventId: ticket.event.majorEventId ?? ticket.event.eventGroup?.majorEventId,
        before: { status: EventTicketStatus.ACTIVE, holderPersonId: personId },
        after: { status: EventTicketStatus.CONSUMED, holderPersonId: personId, consumedAt: effectiveAt.toISOString() },
        metadata: { attendedAt: effectiveAt.toISOString(), processedAt: processedAt.toISOString() },
      });
      await this.realtime.enqueueForUsers(tx, [ticket.holder?.userId], {
        type: 'TICKETS_CHANGED',
        eventId,
        ticketId: ticket.id,
      });
      await this.enqueuePendingTransferChanges(tx, eventId, ticket.id);
      return true;
    });
  }

  /** Enqueues a durable, resumable backfill in the same transaction as the config change. */
  async enqueueExistingSubscriptionReconciliation(
    tx: Prisma.TransactionClient,
    eventId: string,
    effectiveAt: Date = new Date(),
  ): Promise<void> {
    await tx.ticketEntitlementReconciliation.create({
      data: { eventId, createdAt: effectiveAt, nextAttemptAt: effectiveAt },
    });
  }

  /** Aligns unused tickets to the current config or event end while preserving consumed/revoked history. */
  async alignActiveTicketExpirations(
    tx: Prisma.TransactionClient,
    eventId: string,
    options: TicketExpirationAlignmentOptions,
  ): Promise<number> {
    return audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
      await this.lockEventExpirationAlignment(tx, eventId, 'UPDATE');
      const event = await tx.event.findFirst({
        where: { id: eventId },
        select: {
          id: true,
          name: true,
          endDate: true,
          majorEventId: true,
          eventGroup: { select: { majorEventId: true } },
          ticketConfig: {
            select: { id: true, displayName: true, expirationMode: true, customExpiresAt: true },
          },
        },
      });
      const config = event?.ticketConfig;
      if (!event || !config) return 0;
      if (options.scope === 'EVENT_END_ONLY' && config.expirationMode !== TicketExpirationMode.EVENT_END) return 0;

      const effectiveExpiresAt = config.expirationMode === TicketExpirationMode.CUSTOM
        ? config.customExpiresAt
        : event.endDate;
      if (!effectiveExpiresAt) throw new ConflictException('Informe a validade personalizada do bilhete.');

      const where: Prisma.EventTicketWhereInput = {
        eventId,
        ticketConfigId: config.id,
        status: EventTicketStatus.ACTIVE,
        ...(options.scope === 'EVENT_END_ONLY'
          ? { ticketConfig: { is: { expirationMode: TicketExpirationMode.EVENT_END } } }
          : {}),
      };
      const candidates = await tx.eventTicket.findMany({
        where,
        select: {
          id: true,
          status: true,
          expiresAt: true,
          holderPersonId: true,
          holder: { select: { userId: true } },
        },
      });
      const alignedTicketIds: string[] = [];
      const holderUserIds: Array<string | null> = [];

      for (const ticket of candidates) {
        if (ticket.status !== EventTicketStatus.ACTIVE || ticket.expiresAt.getTime() === effectiveExpiresAt.getTime()) continue;
        const changed = await tx.eventTicket.updateMany({
          where: {
            id: ticket.id,
            eventId,
            ticketConfigId: config.id,
            status: EventTicketStatus.ACTIVE,
            expiresAt: ticket.expiresAt,
            ...(options.scope === 'EVENT_END_ONLY'
              ? { ticketConfig: { is: { expirationMode: TicketExpirationMode.EVENT_END } } }
              : {}),
          },
          data: { expiresAt: effectiveExpiresAt },
        });
        if (changed.count !== 1) continue;

        alignedTicketIds.push(ticket.id);
        holderUserIds.push(ticket.holder?.userId ?? null);
        await recordTicketAudit(tx, {
          entityType: AuditLogEntityType.TICKET,
          entityId: ticket.id,
          entityLabel: config.displayName ?? event.name,
          operation: AuditLogOperation.UPDATE,
          summary: options.scope === 'EVENT_END_ONLY'
            ? 'Validade do bilhete alinhada à data final do evento.'
            : 'Validade do bilhete alinhada à configuração do evento.',
          actorUserId: options.actorUserId,
          actorName: options.actorUserId ? undefined : 'Sistema de bilhetes',
          permission: options.permission,
          eventId,
          majorEventId: event.majorEventId ?? event.eventGroup?.majorEventId,
          before: { expiresAt: ticket.expiresAt.toISOString() },
          after: { expiresAt: effectiveExpiresAt.toISOString() },
          metadata: { alignmentScope: options.scope },
        });
      }

      if (alignedTicketIds.length === 0 || options.enqueueInvalidations === false) return alignedTicketIds.length;
      await this.realtime.enqueueForUsers(tx, holderUserIds, { type: 'TICKETS_CHANGED', eventId });
      const pendingTransfers = await tx.ticketTransfer.findMany({
        where: { ticketId: { in: alignedTicketIds }, senderStatus: 'PENDING' },
        select: { authorUserId: true, senderUserId: true, recipientUserId: true },
      });
      if (pendingTransfers.length > 0) {
        await this.realtime.enqueueForUsers(
          tx,
          pendingTransfers.flatMap(({ authorUserId, senderUserId, recipientUserId }) => [
            authorUserId,
            senderUserId,
            recipientUserId,
          ]),
          { type: 'TRANSFERS_CHANGED', eventId },
        );
      }
      return alignedTicketIds.length;
    });
  }

  /** Use the shared lock before reading expiry inputs and the exclusive lock before changing them. */
  async lockEventExpirationAlignment(
    tx: Prisma.TransactionClient,
    eventId: string,
    mode: TicketExpirationRowLockMode = 'UPDATE',
  ): Promise<void> {
    await lockEventTicketExpiration(tx, eventId, mode);
  }

  private async processReconciliationJobs(): Promise<void> {
    if (this.stopped || this.reconciling) return;
    this.reconciling = true;
    try {
      const now = new Date();
      const jobs = await this.prisma.ticketEntitlementReconciliation.findMany({
        where: {
          completedAt: null,
          nextAttemptAt: { lte: now },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 2,
      });
      for (const job of jobs) {
        if (this.stopped) return;
        const leaseUntil = new Date(Date.now() + 5 * 60_000);
        const claim = await this.prisma.ticketEntitlementReconciliation.updateMany({
          where: {
            id: job.id,
            completedAt: null,
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
          },
          data: { leaseUntil },
        });
        if (claim.count !== 1) continue;
        try {
          await this.processReconciliationPage(job.id);
        } catch (error: unknown) {
          await this.deferReconciliation(job.id, job.attempts + 1);
          this.logger.warn(`Ticket entitlement reconciliation failed (${error instanceof Error ? error.name : 'unknown'}).`);
        }
      }
    } catch (error: unknown) {
      this.logger.warn(`Ticket entitlement reconciliation polling failed (${error instanceof Error ? error.name : 'unknown'}).`);
    } finally {
      this.reconciling = false;
    }
  }

  private async processReconciliationPage(jobId: string): Promise<void> {
    await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
      const job = await this.prisma.ticketEntitlementReconciliation.findUnique({ where: { id: jobId } });
      if (!job || job.completedAt) return;
      const event = await this.prisma.event.findUnique({
        where: { id: job.eventId },
        select: {
          id: true,
          deletedAt: true,
          majorEventId: true,
          eventGroup: { select: { majorEventId: true } },
          ticketConfig: { select: { enabled: true, issueOnEventSubscription: true, issueOnMajorEventSubscription: true } },
        },
      });
      if (!event || event.deletedAt || !event.ticketConfig?.enabled) {
        await this.completeReconciliation(jobId);
        return;
      }

      const majorEventId = event.majorEventId ?? event.eventGroup?.majorEventId;
      if (job.phase === TicketEntitlementReconciliationPhase.EVENT_SUBSCRIPTIONS) {
        if (!event.ticketConfig.issueOnEventSubscription) {
          await this.advanceReconciliation(
            jobId,
            event.ticketConfig.issueOnMajorEventSubscription && majorEventId
              ? TicketEntitlementReconciliationPhase.MAJOR_EVENT_SUBSCRIPTIONS
              : TicketEntitlementReconciliationPhase.COMPLETE,
            null,
          );
          return;
        }
        const page = await this.prisma.eventSubscription.findMany({
          where: {
            eventId: job.eventId,
            deletedAt: null,
            createdAt: { lte: job.createdAt },
            personId: job.cursor ? { gt: job.cursor } : undefined,
          },
          select: { personId: true },
          distinct: ['personId'],
          orderBy: { personId: 'asc' },
          take: MAX_RECONCILIATION_PAGE_SIZE,
        });
        if (page.length === 0) {
          await this.advanceReconciliation(
            jobId,
            event.ticketConfig.issueOnMajorEventSubscription && majorEventId
              ? TicketEntitlementReconciliationPhase.MAJOR_EVENT_SUBSCRIPTIONS
              : TicketEntitlementReconciliationPhase.COMPLETE,
            null,
          );
          return;
        }
        for (const { personId } of page) {
          await this.reconcileSource(job.eventId, personId, EventTicketIssueSource.EVENT_SUBSCRIPTION, job.createdAt);
        }
        const phase = page.length < MAX_RECONCILIATION_PAGE_SIZE
          ? event.ticketConfig.issueOnMajorEventSubscription && majorEventId
            ? TicketEntitlementReconciliationPhase.MAJOR_EVENT_SUBSCRIPTIONS
            : TicketEntitlementReconciliationPhase.COMPLETE
          : TicketEntitlementReconciliationPhase.EVENT_SUBSCRIPTIONS;
        await this.advanceReconciliation(jobId, phase, phase === TicketEntitlementReconciliationPhase.EVENT_SUBSCRIPTIONS
          ? page[page.length - 1].personId
          : null);
        return;
      }

      if (job.phase !== TicketEntitlementReconciliationPhase.MAJOR_EVENT_SUBSCRIPTIONS ||
          !event.ticketConfig.issueOnMajorEventSubscription || !majorEventId) {
        await this.completeReconciliation(jobId);
        return;
      }
      const majorPage = await this.prisma.majorEventSubscription.findMany({
        where: {
          majorEventId,
          deletedAt: null,
          subscriptionStatus: 'CONFIRMED',
          createdAt: { lte: job.createdAt },
          updatedAt: { lte: job.createdAt },
          personId: job.cursor ? { gt: job.cursor } : undefined,
        },
        select: { personId: true },
        distinct: ['personId'],
        orderBy: { personId: 'asc' },
        take: MAX_RECONCILIATION_PAGE_SIZE,
      });
      if (majorPage.length === 0) {
        await this.completeReconciliation(jobId);
        return;
      }
      for (const { personId } of majorPage) {
        await this.reconcileSource(job.eventId, personId, EventTicketIssueSource.MAJOR_EVENT_SUBSCRIPTION, job.createdAt);
      }
      if (majorPage.length < MAX_RECONCILIATION_PAGE_SIZE) {
        await this.completeReconciliation(jobId);
      } else {
        await this.advanceReconciliation(
          jobId,
          TicketEntitlementReconciliationPhase.MAJOR_EVENT_SUBSCRIPTIONS,
          majorPage[majorPage.length - 1].personId,
        );
      }
    });
  }

  private async reconcileSource(
    eventId: string,
    personId: string,
    source: AutomaticTicketSource,
    reconciliationCreatedAt: Date,
  ): Promise<void> {
    const key = this.subscriptionSourceKey(eventId, personId, source);
    await runSerializablePrismaTransaction(this.prisma, async (tx) => {
      await this.syncForPerson(tx, eventId, personId, source, key, { reconciliationCreatedAt });
    });
  }

  private async advanceReconciliation(
    jobId: string,
    phase: TicketEntitlementReconciliationPhase,
    cursor: string | null,
  ): Promise<void> {
    await this.prisma.ticketEntitlementReconciliation.updateMany({
      where: { id: jobId, completedAt: null },
      data: {
        phase,
        cursor,
        leaseUntil: null,
        nextAttemptAt: new Date(Date.now() + 250),
        lastError: null,
      },
    });
  }

  private async completeReconciliation(jobId: string): Promise<void> {
    await this.prisma.ticketEntitlementReconciliation.updateMany({
      where: { id: jobId, completedAt: null },
      data: {
        phase: TicketEntitlementReconciliationPhase.COMPLETE,
        completedAt: new Date(),
        leaseUntil: null,
        lastError: null,
      },
    });
  }

  private async deferReconciliation(jobId: string, attempts: number): Promise<void> {
    const delaySeconds = Math.min(60 * 60, 2 ** Math.min(attempts, 12));
    await this.prisma.ticketEntitlementReconciliation.updateMany({
      where: { id: jobId, completedAt: null },
      data: {
        attempts,
        nextAttemptAt: new Date(Date.now() + delaySeconds * 1_000),
        leaseUntil: null,
        lastError: 'Entitlement reconciliation failed.',
      },
    });
  }

  private async personLineageIds(tx: Prisma.TransactionClient, personId: string): Promise<string[]> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE person_lineage AS (
        SELECT id
        FROM people
        WHERE id = ${personId}
        UNION
        SELECT merged.id
        FROM people merged
        INNER JOIN person_lineage parent ON merged."mergedIntoId" = parent.id
      )
      SELECT id FROM person_lineage
    `;
    return [...new Set([personId, ...rows.map(({ id }) => id)])];
  }

  private async sourceSubscriptionIsEligible(
    tx: Prisma.TransactionClient,
    event: TicketEventEntitlementContext,
    personId: string,
    source: AutomaticTicketSource,
    eligibleAt?: Date,
  ): Promise<boolean> {
    if (event.deletedAt) return false;
    if (source === EventTicketIssueSource.EVENT_SUBSCRIPTION) {
      return Boolean(await tx.eventSubscription.findFirst({
        where: {
          eventId: event.id,
          personId,
          deletedAt: null,
          ...(eligibleAt ? { createdAt: { lte: eligibleAt } } : {}),
        },
        select: { id: true },
      }));
    }

    const majorEventId = event.majorEventId ?? event.eventGroup?.majorEventId;
    if (!majorEventId) return false;
    const subscription = await tx.majorEventSubscription.findFirst({
      where: {
        majorEventId,
        personId,
        deletedAt: null,
        subscriptionStatus: 'CONFIRMED',
        ...(eligibleAt
          ? {
              createdAt: { lte: eligibleAt },
              updatedAt: { lte: eligibleAt },
            }
          : {}),
      },
      select: {
        paymentTier: true,
      },
    });
    if (!subscription) return false;
    return true;
  }

  private async automaticEntitlementIsEligible(
    tx: Prisma.TransactionClient,
    event: TicketEventEntitlementContext,
    personId: string,
    source: AutomaticTicketSource,
  ): Promise<boolean> {
    const config = event.ticketConfig;
    if (!config?.enabled) return false;
    const sourceEnabled = source === EventTicketIssueSource.EVENT_SUBSCRIPTION
      ? config.issueOnEventSubscription
      : config.issueOnMajorEventSubscription;
    if (!sourceEnabled || !(await this.sourceSubscriptionIsEligible(tx, event, personId, source))) return false;
    return this.includedPriceTierAllows(tx, event, personId, source, config.includedPriceTierIds);
  }

  private async revokeSubscriptionTicket(
    tx: Prisma.TransactionClient,
    event: TicketEventEntitlementContext,
    personId: string,
    source: AutomaticTicketSource,
    sourceKey: string,
  ): Promise<void> {
    const lineagePersonIds = await this.personLineageIds(tx, personId);
    const exactTicket = await tx.eventTicket.findUnique({ where: { sourceKey } });
    const ticket = exactTicket?.status === EventTicketStatus.ACTIVE && exactTicket.holderPersonId === personId
      ? exactTicket
      : await tx.eventTicket.findFirst({
          where: {
            eventId: event.id,
            holderPersonId: personId,
            originalHolderPersonId: { in: lineagePersonIds },
            source,
            status: EventTicketStatus.ACTIVE,
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
    if (!ticket || ticket.status !== EventTicketStatus.ACTIVE || ticket.holderPersonId !== personId) return;
    const transferred = await tx.eventTicketHistory.findFirst({
      where: { ticketId: ticket.id, operation: TicketHistoryOperation.TRANSFERRED },
      select: { id: true },
    });
    if (transferred) return;

    const changed = await tx.eventTicket.updateMany({
      where: { id: ticket.id, status: EventTicketStatus.ACTIVE, holderPersonId: personId },
      data: {
        status: EventTicketStatus.REVOKED,
        revokedAt: new Date(),
        revokedReason: 'SUBSCRIPTION_NO_LONGER_ELIGIBLE',
      },
    });
    if (changed.count !== 1) return;

    await tx.eventTicketHistory.create({
      data: {
        ticketId: ticket.id,
        operation: TicketHistoryOperation.REVOKED,
        previousHolderPersonId: personId,
        reason: 'Inscrição cancelada ou fora dos critérios do bilhete.',
      },
    });
    await recordTicketAudit(tx, {
      entityType: AuditLogEntityType.TICKET,
      entityId: ticket.id,
      entityLabel: event.ticketConfig?.displayName ?? event.name,
      operation: AuditLogOperation.UPDATE,
      summary: 'Bilhete revogado após alteração da inscrição.',
      actorName: 'Sistema de inscrições',
      eventId: event.id,
      majorEventId: event.majorEventId ?? event.eventGroup?.majorEventId,
      before: { status: ticket.status, holderPersonId: ticket.holderPersonId },
      after: { status: EventTicketStatus.REVOKED, holderPersonId: personId },
    });
    await this.realtime.enqueueForUsers(tx, [await this.userIdForPerson(tx, personId)], {
      type: 'TICKETS_CHANGED',
      eventId: event.id,
      ticketId: ticket.id,
    });
    await this.enqueuePendingTransferChanges(tx, event.id, ticket.id);
  }

  private async includedPriceTierAllows(
    tx: Prisma.TransactionClient,
    event: TicketEventEntitlementContext,
    personId: string,
    source: AutomaticTicketSource,
    includedPriceTierIds: readonly string[],
    eligibleAt?: Date,
  ): Promise<boolean> {
    if (includedPriceTierIds.length === 0 || source === EventTicketIssueSource.EVENT_SUBSCRIPTION) return true;
    const majorEventId = event.majorEventId ?? event.eventGroup?.majorEventId;
    if (!majorEventId) return false;
    const subscription = await tx.majorEventSubscription.findFirst({
      where: {
        majorEventId,
        personId,
        deletedAt: null,
        subscriptionStatus: 'CONFIRMED',
        ...(eligibleAt
          ? {
              createdAt: { lte: eligibleAt },
              updatedAt: { lte: eligibleAt },
            }
          : {}),
      },
      select: { paymentTier: true },
    });
    return this.priceTierIncluded(tx, majorEventId, subscription?.paymentTier ?? null, includedPriceTierIds);
  }

  private async priceTierIncluded(
    tx: Prisma.TransactionClient,
    majorEventId: string,
    paymentTier: string | null,
    includedPriceTierIds: readonly string[],
  ): Promise<boolean> {
    if (includedPriceTierIds.length === 0) return true;
    if (!paymentTier?.trim()) return false;
    const tiers = await tx.priceTier.findMany({
      where: { price: { majorEventId } },
      select: { id: true, name: true },
    });
    const selectedTier = tiers.find(
      (tier) => tier.name.trim().toLocaleLowerCase('pt-BR') === paymentTier.trim().toLocaleLowerCase('pt-BR'),
    );
    return Boolean(selectedTier && includedPriceTierIds.includes(selectedTier.id));
  }

  private async requireEvent(tx: Prisma.TransactionClient, eventId: string): Promise<TicketEventEntitlementContext> {
    const event = await tx.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        endDate: true,
        deletedAt: true,
        majorEventId: true,
        majorEvent: { select: { isPaymentRequired: true } },
        eventGroup: {
          select: {
            majorEventId: true,
            majorEvent: { select: { isPaymentRequired: true } },
          },
        },
        ticketConfig: {
          select: {
            id: true,
            enabled: true,
            displayName: true,
            issueOnEventSubscription: true,
            issueOnMajorEventSubscription: true,
            includedPriceTierIds: true,
            expirationMode: true,
            customExpiresAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    return event;
  }

  private resolveExpiration(event: TicketEventEntitlementContext): Date {
    if (event.ticketConfig?.expirationMode === 'CUSTOM') {
      if (!event.ticketConfig.customExpiresAt) throw new ConflictException('Informe a validade personalizada do bilhete.');
      return event.ticketConfig.customExpiresAt;
    }
    return event.endDate;
  }

  private async lockHolder(tx: Prisma.TransactionClient, eventId: string, personId: string): Promise<void> {
    const key = `ticket-holder:${eventId}:${personId}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }

  private subscriptionSourceKey(eventId: string, personId: string, source: AutomaticTicketSource): string {
    const prefix = source === EventTicketIssueSource.EVENT_SUBSCRIPTION
      ? 'event-subscription'
      : 'major-event-subscription';
    return `${prefix}:${eventId}:${personId}`;
  }

  private safeReason(reason?: string | null): string | null {
    const normalized = reason?.trim();
    return normalized ? normalized.slice(0, 1_000) : null;
  }

  private async userIdForPerson(tx: Prisma.TransactionClient, personId: string): Promise<string | null> {
    const person = await tx.people.findUnique({ where: { id: personId }, select: { userId: true } });
    return person?.userId ?? null;
  }

  private async enqueuePendingTransferChanges(
    tx: Prisma.TransactionClient,
    eventId: string,
    ticketId: string,
  ): Promise<void> {
    const pending = await tx.ticketTransfer.findMany({
      where: { ticketId, senderStatus: 'PENDING' },
      select: { authorUserId: true, senderUserId: true, recipientUserId: true },
    });
    if (pending.length === 0) return;
    await this.realtime.enqueueForUsers(
      tx,
      pending.flatMap(({ authorUserId, senderUserId, recipientUserId }) => [
        authorUserId,
        senderUserId,
        recipientUserId,
      ]),
      { type: 'TRANSFERS_CHANGED', eventId, ticketId },
    );
  }
}
