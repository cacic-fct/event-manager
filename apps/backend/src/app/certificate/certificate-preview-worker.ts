import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { getRedisConnectionOptions } from '../weather/redis-connection';
import { CertificateDownloadService } from './certificate-download.service';
import { CertificatePreviewCache } from './certificate-preview-cache';
import {
  CertificatePreviewResourceError,
  hasCertificatePreviewHeadroom,
  renderCertificatePreviewInChild,
} from './certificate-preview-process';
import {
  CERTIFICATE_PREVIEW_JOB,
  CERTIFICATE_PREVIEW_MAX_AGE_MS,
  CERTIFICATE_PREVIEW_QUEUE,
  CERTIFICATE_PREVIEW_SWEEP,
  findCertificatePreviewSource,
  isCertificatePreviewId,
  type CertificatePreviewJob,
} from './certificate-preview-source';

const HEALTH_INTERVAL_MS = 3000;
const HEALTH_TTL_MS = 8000;
const MEMORY_COOLDOWN_MS = 30_000;

@Injectable()
export class CertificatePreviewWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CertificatePreviewWorker.name);
  private readonly shutdown = new AbortController();
  private queue?: Queue;
  private worker?: Worker<CertificatePreviewJob | Record<string, never>>;
  private startup?: Promise<void>;
  private heartbeat?: NodeJS.Timeout;
  private retry?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CertificatePreviewCache,
    private readonly download: CertificateDownloadService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.CERTIFICATE_PREVIEW_ENABLED === 'true' && this.cache.enabled) {
      this.startInBackground();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.shutdown.abort();
    clearTimeout(this.retry);
    clearInterval(this.heartbeat);
    await this.startup;
    await this.worker?.close();
    await this.queue?.close();
  }

  private startInBackground(): void {
    this.startup = this.start().catch(async (error: unknown) => {
      await this.worker?.close().catch(() => undefined);
      await this.queue?.close().catch(() => undefined);
      if (!this.shutdown.signal.aborted) {
        this.logger.warn('Certificate preview queue is temporarily unavailable.', error);
        this.retry = setTimeout(() => this.startInBackground(), 15_000);
        this.retry.unref();
      }
    });
  }

  private async start(): Promise<void> {
    await this.cache.assertBoundedStorage();
    this.shutdown.signal.throwIfAborted();
    const connection = getRedisConnectionOptions();
    const prefix = process.env.BACKEND_E2E_QUEUE_PREFIX;
    const queue = new Queue(CERTIFICATE_PREVIEW_QUEUE, {
      connection: {
        ...connection,
        lazyConnect: true,
        connectTimeout: 2000,
        commandTimeout: 2000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      },
      prefix,
    });
    this.queue = queue;
    queue.on('error', () => {
      // A stale heartbeat prevents new work if Redis is unavailable.
    });
    await queue.setGlobalConcurrency(1);
    await queue.upsertJobScheduler(
      'expire-preview-cache',
      { every: 60 * 60_000 },
      {
        name: CERTIFICATE_PREVIEW_SWEEP,
        data: {},
        opts: { removeOnComplete: true, removeOnFail: true },
      },
    );

    const redis = await queue.client;
    const healthKey = queue.toKey('health');
    const cooldownKey = queue.toKey('cooldown');
    const suspendAdmission = () => redis.set(cooldownKey, '1', { PX: MEMORY_COOLDOWN_MS });

    if (this.shutdown.signal.aborted) {
      return;
    }

    const worker = new Worker<CertificatePreviewJob | Record<string, never>>(
      CERTIFICATE_PREVIEW_QUEUE,
      async (job) => {
        if (job.name === CERTIFICATE_PREVIEW_SWEEP) {
          await this.cache.expire();
          return;
        }

        const { certificateId, revision } = job.data;
        if (
          job.name !== CERTIFICATE_PREVIEW_JOB ||
          !certificateId ||
          !isCertificatePreviewId(certificateId) ||
          !revision ||
          !/^[a-f0-9]{64}$/.test(revision) ||
          Date.now() - job.timestamp > CERTIFICATE_PREVIEW_MAX_AGE_MS
        ) {
          throw new Error('Invalid or expired certificate preview request.');
        }
        if (!hasCertificatePreviewHeadroom()) {
          await suspendAdmission();
          throw new Error('Insufficient memory for certificate preview.');
        }

        try {
          await this.render(certificateId, revision);
        } catch (error) {
          if (error instanceof CertificatePreviewResourceError) {
            await suspendAdmission().catch(() => undefined);
          }
          throw error;
        }
      },
      {
        connection: { ...connection, lazyConnect: true, connectTimeout: 2000 },
        prefix,
        concurrency: 1,
        maxStalledCount: 0,
        stalledInterval: 15_000,
        lockDuration: 20_000,
      },
    );
    this.worker = worker;
    worker.on('error', (error) => this.logger.warn(error.message));
    worker.on('failed', (job, error) => {
      if (job?.name === CERTIFICATE_PREVIEW_SWEEP) {
        this.logger.warn(`Certificate preview cleanup failed: ${error.message}`);
      }
    });

    let healthRunning = false;
    const updateHealth = async () => {
      if (this.shutdown.signal.aborted || healthRunning || !worker.isRunning()) {
        return;
      }
      healthRunning = true;
      try {
        if (hasCertificatePreviewHeadroom()) {
          await redis.set(healthKey, '1', { PX: HEALTH_TTL_MS });
        } else {
          await suspendAdmission();
        }
      } catch {
        // The last heartbeat expires and producers stop accepting jobs.
      } finally {
        healthRunning = false;
      }
    };
    await worker.waitUntilReady();
    await updateHealth();
    if (!this.shutdown.signal.aborted) {
      this.heartbeat = setInterval(() => void updateHealth(), HEALTH_INTERVAL_MS);
      this.heartbeat.unref();
    }
  }

  private async render(certificateId: string, revision: string): Promise<void> {
    if ((await findCertificatePreviewSource(this.prisma, certificateId))?.revision !== revision) {
      throw new Error('Certificate changed before preview rendering.');
    }
    if (await this.cache.has(revision)) {
      return;
    }

    const html = await this.download.loadPublicPreviewHtml(certificateId);
    const image = await renderCertificatePreviewInChild(html, this.shutdown.signal);
    if ((await findCertificatePreviewSource(this.prisma, certificateId))?.revision !== revision) {
      throw new Error('Certificate changed during preview rendering.');
    }
    await this.cache.store(revision, image);
  }
}
