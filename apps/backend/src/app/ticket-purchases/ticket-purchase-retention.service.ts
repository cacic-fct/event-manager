import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1_000;
const CLEANUP_BATCH_SIZE = 100;

@Injectable()
export class TicketPurchaseRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketPurchaseRetentionService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopped = false;

  constructor(private readonly prisma: PrismaService, private readonly s3: S3Service) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.clearExpiredReceipts(), CLEANUP_INTERVAL_MS);
    this.timer.unref();
    void this.clearExpiredReceipts();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  async clearExpiredReceipts(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    const cutoff = new Date();
    let cursor: string | undefined;
    try {
      while (!this.stopped) {
        const purchases = await this.prisma.ticketPurchase.findMany({
          where: { receiptExpiresAt: { lte: cutoff }, objectKey: { not: '' } },
          select: { id: true, objectKey: true },
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          take: CLEANUP_BATCH_SIZE,
        });
        if (!purchases.length) break;
        for (const purchase of purchases) {
          if (this.stopped) break;
          try {
            // Clear the key only after deletion succeeds. Failed deletions retry next run.
            await this.s3.deleteFile(purchase.objectKey);
            await this.prisma.ticketPurchase.updateMany({
              where: { id: purchase.id, objectKey: purchase.objectKey, receiptExpiresAt: { lte: cutoff } },
              data: { objectKey: '' },
            });
          } catch (error: unknown) {
            this.logger.warn(`Expired ticket receipt cleanup failed (${error instanceof Error ? error.name : 'unknown'}).`);
          }
        }
        cursor = purchases[purchases.length - 1].id;
        if (purchases.length < CLEANUP_BATCH_SIZE) break;
      }
    } catch (error: unknown) {
      this.logger.warn(`Ticket receipt retention query failed (${error instanceof Error ? error.name : 'unknown'}).`);
    } finally {
      this.running = false;
    }
  }
}
