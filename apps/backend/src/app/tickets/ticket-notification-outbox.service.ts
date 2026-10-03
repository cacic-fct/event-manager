import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NovuNotificationsService } from '../notifications/novu-notifications.service';

const OUTBOX_BATCH_SIZE = 40;
const OUTBOX_POLL_INTERVAL_MS = 2_500;
const OUTBOX_LEASE_MS = 30_000;

@Injectable()
export class TicketNotificationOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketNotificationOutboxService.name);
  private pollTimer?: NodeJS.Timeout;
  private processing = false;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly novu: NovuNotificationsService,
  ) {}

  onModuleInit(): void {
    this.pollTimer = setInterval(() => void this.processPending(), OUTBOX_POLL_INTERVAL_MS);
    this.pollTimer.unref();
    void this.processPending();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private async processPending(): Promise<void> {
    if (this.stopped || this.processing) return;
    this.processing = true;
    try {
      const now = new Date();
      const pending = await this.prisma.ticketNotificationOutbox.findMany({
        where: {
          sentAt: null,
          nextAttemptAt: { lte: now },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: OUTBOX_BATCH_SIZE,
      });

      for (const item of pending) {
        if (this.stopped) return;
        const leaseUntil = new Date(Date.now() + OUTBOX_LEASE_MS);
        const claim = await this.prisma.ticketNotificationOutbox.updateMany({
          where: {
            id: item.id,
            sentAt: null,
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
          },
          data: { leaseUntil },
        });
        if (claim.count !== 1) continue;

        const sent = await this.novu.notifyTicketTransfer({
          notificationType: item.notificationType,
          transferId: item.transferId,
          recipientUserId: item.recipientUserId,
          ticketName: item.ticketName,
          eventName: item.eventName,
          actorFirstName: item.actorFirstName,
          actionUrl: item.actionUrl,
        });
        if (sent) {
          await this.prisma.ticketNotificationOutbox.updateMany({
            where: { id: item.id, sentAt: null },
            data: { sentAt: new Date(), leaseUntil: null, lastError: null },
          });
        } else {
          await this.defer(item.id, item.attempts + 1);
        }
      }
    } catch (error: unknown) {
      this.logger.warn(`Ticket notification outbox polling failed (${error instanceof Error ? error.name : 'unknown'}).`);
    } finally {
      this.processing = false;
    }
  }

  private async defer(id: string, attempts: number): Promise<void> {
    const delaySeconds = Math.min(60 * 60, 2 ** Math.min(attempts, 12));
    await this.prisma.ticketNotificationOutbox.updateMany({
      where: { id, sentAt: null },
      data: {
        attempts,
        nextAttemptAt: new Date(Date.now() + delaySeconds * 1_000),
        leaseUntil: null,
        lastError: 'Novu notification was not acknowledged.',
      },
    });
  }
}
