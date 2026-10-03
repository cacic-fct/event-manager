import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const RETENTION_DAYS_AFTER_EVENT_END = 30;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const CLEANUP_BATCH_SIZE = 250;

@Injectable()
export class TicketTransferRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketTransferRetentionService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopped = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.clearExpiredDocuments(), CLEANUP_INTERVAL_MS);
    this.timer.unref();
    void this.clearExpiredDocuments();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  private async clearExpiredDocuments(): Promise<void> {
    if (this.stopped || this.running) return;
    this.running = true;
    try {
      const cutoff = new Date(Date.now() - RETENTION_DAYS_AFTER_EVENT_END * 24 * 60 * 60 * 1_000);
      while (!this.stopped) {
        const candidates = await this.prisma.ticketTransfer.findMany({
          where: {
            submittedDestinationIdentityDocumentEncrypted: { not: null },
            OR: [
              { senderStatus: { in: ['ACCEPTED', 'CANCELED', 'EXPIRED'] } },
              { recipientStatus: { in: ['IGNORED', 'SYSTEM_INELIGIBLE', 'SYSTEM_DUPLICATE'] } },
            ],
            event: { endDate: { lte: cutoff } },
          },
          select: { id: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: CLEANUP_BATCH_SIZE,
        });
        if (candidates.length === 0) break;
        await this.prisma.ticketTransfer.updateMany({
          where: { id: { in: candidates.map(({ id }) => id) } },
          data: { submittedDestinationIdentityDocumentEncrypted: null },
        });
        if (candidates.length < CLEANUP_BATCH_SIZE) break;
      }
    } catch (error: unknown) {
      this.logger.warn(`Expired ticket transfer document cleanup failed (${error instanceof Error ? error.name : 'unknown'}).`);
    } finally {
      this.running = false;
    }
  }
}
