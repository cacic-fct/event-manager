import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { buildBullMqJobId } from '../queues/bullmq-job-id';

export const LGPD_STORAGE_CLEANUP_QUEUE = 'lgpd-storage-cleanup';
export const LGPD_STORAGE_CLEANUP_JOB = 'delete-object';
export const LGPD_STORAGE_CLEANUP_RECONCILE_JOB = 'reconcile';

const CLEANUP_LEASE_MS = 5 * 60_000;
const CLEANUP_RETRY_BASE_MS = 30_000;

export interface LgpdStorageCleanupJob {
  outboxId: string;
}

@Injectable()
export class LgpdStorageCleanupService implements OnModuleInit {
  private readonly logger = new Logger(LgpdStorageCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    @InjectQueue(LGPD_STORAGE_CLEANUP_QUEUE)
    private readonly queue: Queue<LgpdStorageCleanupJob>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      buildBullMqJobId('lgpd-storage-cleanup', 'reconcile'),
      { pattern: '* * * * *' },
      {
        name: LGPD_STORAGE_CLEANUP_RECONCILE_JOB,
        data: {} as never,
        opts: {
          removeOnComplete: true,
          removeOnFail: 50,
        },
      },
    );
  }

  async enqueueInTransaction(
    tx: Prisma.TransactionClient,
    requestId: string,
    objectKeys: readonly string[],
  ): Promise<void> {
    for (const objectKey of new Set(objectKeys)) {
      await tx.lgpdStorageCleanupOutbox.upsert({
        where: {
          requestId_objectKey: { requestId, objectKey },
        },
        create: { requestId, objectKey },
        update: {
          status: 'PENDING',
          nextAttemptAt: new Date(),
          leaseUntil: null,
          lastError: null,
          deletedAt: null,
        },
      });
    }
  }

  async reconcile(): Promise<void> {
    const pending = await this.prisma.lgpdStorageCleanupOutbox.findMany({
      where: {
        OR: [
          { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
          { status: 'PROCESSING', leaseUntil: { lte: new Date() } },
        ],
      },
      select: { id: true, attempts: true },
      take: 100,
    });
    const queued = await Promise.allSettled(
      pending.map((item) =>
        this.queue.add(
          LGPD_STORAGE_CLEANUP_JOB,
          { outboxId: item.id },
          {
            jobId: buildBullMqJobId('lgpd-storage-cleanup', item.id, item.attempts + 1),
            removeOnComplete: true,
            removeOnFail: 50,
          },
        ),
      ),
    );
    queued.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.warn(`Could not enqueue LGPD storage cleanup outbox=${pending[index]?.id ?? 'unknown'}.`);
      }
    });
  }

  async process(input: LgpdStorageCleanupJob): Promise<void> {
    const claim = await this.claim(input.outboxId);
    if (!claim) {
      return;
    }

    try {
      const outbox = await this.prisma.lgpdStorageCleanupOutbox.findUnique({
        where: { id: claim.id },
        select: { objectKey: true },
      });
      if (!outbox) {
        return;
      }
      // DeleteObject is idempotent in S3-compatible storage. A retried job is
      // therefore safe after a worker/process crash at any point.
      await this.s3.deleteFile(outbox.objectKey);
      await this.prisma.lgpdStorageCleanupOutbox.updateMany({
        where: { id: claim.id, status: 'PROCESSING' },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          leaseUntil: null,
          lastError: null,
        },
      });
    } catch (error: unknown) {
      await this.markFailure(claim.id, error);
    }
  }

  private async claim(id: string): Promise<{ id: string; attempts: number } | null> {
    const now = new Date();
    const updated = await this.prisma.lgpdStorageCleanupOutbox.updateMany({
      where: {
        id,
        OR: [
          { status: 'PENDING', nextAttemptAt: { lte: now } },
          { status: 'PROCESSING', leaseUntil: { lte: now } },
        ],
      },
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
        leaseUntil: new Date(Date.now() + CLEANUP_LEASE_MS),
        lastError: null,
      },
    });
    if (updated.count !== 1) {
      return null;
    }
    return this.prisma.lgpdStorageCleanupOutbox.findUnique({
      where: { id },
      select: { id: true, attempts: true },
    });
  }

  private async markFailure(id: string, error: unknown): Promise<void> {
    const current = await this.prisma.lgpdStorageCleanupOutbox.findUnique({
      where: { id },
      select: { attempts: true, status: true },
    });
    if (!current || current.status === 'DELETED') {
      return;
    }
    const delay = Math.min(CLEANUP_RETRY_BASE_MS * 2 ** Math.max(current.attempts - 1, 0), 60 * 60_000);
    await this.prisma.lgpdStorageCleanupOutbox.updateMany({
      where: { id, status: 'PROCESSING' },
      data: {
        status: 'PENDING',
        nextAttemptAt: new Date(Date.now() + delay),
        leaseUntil: null,
        lastError: error instanceof Error ? error.message : String(error),
      },
    });
    this.logger.warn(`LGPD storage cleanup retry scheduled for outbox=${id}.`);
  }
}
