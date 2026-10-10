import { Injectable, Logger, MessageEvent, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, TicketRealtimeInvalidationType, TicketRealtimeScopeType } from '@prisma/client';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeInvalidationService } from '../realtime/realtime-invalidation.service';
import type { TicketRealtimeInvalidation } from '@cacic-fct/shared-ticketing';

const CURRENT_USER_TICKETS_CHANNEL = 'current-user-tickets';
const OUTBOX_BATCH_SIZE = 50;
const OUTBOX_POLL_INTERVAL_MS = 2_000;
const OUTBOX_LEASE_MS = 30_000;

export type TicketRealtimeEnqueueInput = {
  type: TicketRealtimeInvalidationType;
  eventId?: string;
  ticketId?: string;
  transferId?: string;
  purchaseId?: string;
};

export type TicketRealtimeTransaction = Prisma.TransactionClient | PrismaService;

@Injectable()
export class TicketRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketRealtimeService.name);
  private pollTimer?: NodeJS.Timeout;
  private publishing = false;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly invalidations: RealtimeInvalidationService,
  ) {}

  onModuleInit(): void {
    this.pollTimer = setInterval(() => void this.publishPending(), OUTBOX_POLL_INTERVAL_MS);
    this.pollTimer.unref();
    void this.publishPending();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  async enqueueForUsers(
    tx: TicketRealtimeTransaction,
    userIds: readonly (string | null | undefined)[],
    input: TicketRealtimeEnqueueInput,
  ): Promise<void> {
    const recipients = [...new Set(userIds.filter((userId): userId is string => Boolean(userId)))];
    const records: Prisma.TicketRealtimeOutboxCreateManyInput[] = recipients.map((recipientUserId) => ({
      scopeType: TicketRealtimeScopeType.USER,
      recipientUserId,
      type: input.type,
      eventId: input.eventId,
      ticketId: input.ticketId,
      transferId: input.transferId,
      purchaseId: input.purchaseId,
    }));
    if (input.eventId) {
      records.push({
        scopeType: TicketRealtimeScopeType.ADMIN_EVENT,
        recipientUserId: null,
        type: input.type,
        eventId: input.eventId,
        ticketId: input.ticketId,
        transferId: input.transferId,
        purchaseId: input.purchaseId,
      });
    }
    if (records.length === 0) return;
    await tx.ticketRealtimeOutbox.createMany({ data: records });
  }

  scope(userId: string): string {
    return this.invalidations.scope(CURRENT_USER_TICKETS_CHANNEL, userId);
  }

  adminEventScope(eventId: string): string {
    return this.invalidations.scope('admin-event-tickets', eventId);
  }

  watch(userId: string): Observable<MessageEvent> {
    return this.invalidations.watch(this.scope(userId));
  }

  watchAdminEvent(eventId: string): Observable<MessageEvent> {
    return this.invalidations.watch(this.adminEventScope(eventId));
  }

  private async publishPending(): Promise<void> {
    if (this.stopped || this.publishing) return;
    this.publishing = true;
    try {
      const now = new Date();
      const pending = await this.prisma.ticketRealtimeOutbox.findMany({
        where: {
          publishedAt: null,
          nextAttemptAt: { lte: now },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: OUTBOX_BATCH_SIZE,
      });

      for (const record of pending) {
        if (this.stopped) return;
        const leaseUntil = new Date(Date.now() + OUTBOX_LEASE_MS);
        const claim = await this.prisma.ticketRealtimeOutbox.updateMany({
          where: {
            id: record.id,
            publishedAt: null,
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
          },
          data: { leaseUntil },
        });
        if (claim.count !== 1) continue;

        const data: TicketRealtimeInvalidation = {
          revision: record.id,
          type: record.type,
          ...(record.eventId ? { eventId: record.eventId } : {}),
          ...(record.ticketId ? { ticketId: record.ticketId } : {}),
          ...(record.transferId ? { transferId: record.transferId } : {}),
          ...(record.purchaseId ? { purchaseId: record.purchaseId } : {}),
          changedAt: record.createdAt.toISOString(),
        };

        const scope = record.scopeType === TicketRealtimeScopeType.USER && record.recipientUserId
          ? this.scope(record.recipientUserId)
          : record.scopeType === TicketRealtimeScopeType.ADMIN_EVENT && record.eventId
            ? this.adminEventScope(record.eventId)
            : null;
        if (!scope) {
          await this.prisma.ticketRealtimeOutbox.updateMany({
            where: { id: record.id, publishedAt: null },
            data: { publishedAt: new Date(), leaseUntil: null, lastError: null },
          });
          continue;
        }

        try {
          await this.invalidations.publish(scope, data);
          await this.prisma.ticketRealtimeOutbox.updateMany({
            where: { id: record.id, publishedAt: null },
            data: { publishedAt: new Date(), leaseUntil: null, lastError: null },
          });
        } catch {
          await this.defer(record.id, record.attempts + 1);
        }
      }
    } catch (error: unknown) {
      this.logger.warn(`Ticket realtime outbox polling failed (${error instanceof Error ? error.name : 'unknown'}).`);
    } finally {
      this.publishing = false;
    }
  }

  private async defer(id: string, attempts: number): Promise<void> {
    const delaySeconds = Math.min(60 * 60, 2 ** Math.min(attempts, 12));
    await this.prisma.ticketRealtimeOutbox.updateMany({
      where: { id, publishedAt: null },
      data: {
        attempts,
        nextAttemptAt: new Date(Date.now() + delaySeconds * 1_000),
        leaseUntil: null,
        lastError: 'Realtime publication failed.',
      },
    });
  }
}
