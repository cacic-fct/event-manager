import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { getRedisConnectionOptions } from '../weather/redis-connection';
import { RESERVE_CERTIFICATE_PREVIEW } from './certificate-preview-admission';
import { CertificatePreviewCache } from './certificate-preview-cache';
import {
  CERTIFICATE_PREVIEW_JOB,
  CERTIFICATE_PREVIEW_QUEUE,
  findCertificatePreviewSource,
  isCertificatePreviewId,
  type CertificatePreviewJob,
} from './certificate-preview-source';

type PreviewRequest = { imagePath: string | null };

const MAX_HTTP_OPERATIONS = 12;
const TOKEN_TTL_MS = 10 * 60_000;
const RESERVE_COMMAND = 'reservePublicCertificatePreview';
const RETRY_COMMAND = 'managePublicCertificatePreviewRetry';
// Serialize failed-job replacement across producers and release only our own lock.
const MANAGE_PREVIEW_RETRY = `
local lock, reservations = KEYS[1], KEYS[2]
local operation, token, revision = ARGV[1], ARGV[2], ARGV[3]
if operation == 'acquire' then
  return redis.call('SET', lock, token, 'PX', 30000, 'NX')
end
if redis.call('GET', lock) ~= token then return 0 end
if operation == 'reset' then return redis.call('ZREM', reservations, revision) end
return redis.call('DEL', lock)
`;

@Injectable()
export class CertificatePreviewService implements OnModuleDestroy {
  private queue?: Queue<CertificatePreviewJob>;
  private admissionRegistered = false;
  private nextConnectionAttempt = 0;
  private activeOperations = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CertificatePreviewCache,
  ) {}

  createToken(certificate: { id: string; issuedAt: Date }): string | null {
    const key = this.signingKey();
    if (!key || !isCertificatePreviewId(certificate.id)) {
      return null;
    }

    const payload = `${certificate.issuedAt.getTime()}.${Date.now() + TOKEN_TTL_MS}`;
    return `${payload}.${this.sign(key, certificate.id, payload).toString('base64url')}`;
  }

  request(certificateId: string, token: string): Promise<PreviewRequest | null> {
    return this.withAuthorizedSource(certificateId, token, async (revision) => {
      if (await this.cache.has(revision)) {
        return { imagePath: `/api/certificates/validate/${encodeURIComponent(certificateId)}/preview` };
      }

      const queue = this.getQueue();
      if (!queue) {
        return null;
      }
      const existing = await queue.getJob(revision);
      const state = await existing?.getState();
      if (existing && state !== 'failed') {
        return state === 'active' || state === 'waiting' ? { imagePath: null } : null;
      }

      const redis = await queue.client;
      if (!this.admissionRegistered) {
        redis.defineCommand(RESERVE_COMMAND, { lua: RESERVE_CERTIFICATE_PREVIEW, numberOfKeys: 7 });
        redis.defineCommand(RETRY_COMMAND, { lua: MANAGE_PREVIEW_RETRY, numberOfKeys: 2 });
        this.admissionRegistered = true;
      }
      const retryKey = queue.toKey(`retry:${revision}`);
      const retryToken = randomUUID();
      const retryArgs = [retryKey, queue.toKey('reservations')];
      if (
        existing &&
        (await redis.runCommand(RETRY_COMMAND, [...retryArgs, 'acquire', retryToken, revision])) !== 'OK'
      ) {
        return { imagePath: null };
      }
      if (!existing && (await redis.get(retryKey))) {
        return { imagePath: null };
      }
      try {
        if (existing) {
          // Recheck under the retry lock: another caller may already have replaced it.
          const current = await queue.getJob(revision);
          if (current) {
            const currentState = await current.getState();
            if (currentState !== 'failed') {
              return currentState === 'active' || currentState === 'waiting' ? { imagePath: null } : null;
            }
            await current.remove();
          }
          // A retained failure must not reuse the old pre-enqueue reservation.
          await redis.runCommand(RETRY_COMMAND, [...retryArgs, 'reset', retryToken, revision]);
        }
        const reserved: unknown = await redis.runCommand(RESERVE_COMMAND, [
          queue.toKey('health'),
          queue.toKey('cooldown'),
          queue.toKey('budget'),
          queue.toKey('reservations'),
          queue.toKey('wait'),
          queue.toKey('active'),
          queue.toKey('paused'),
          revision,
          queue.toKey(''),
        ]);
        if (reserved !== 1 && reserved !== 2) {
          return null;
        }
        if (reserved === 1) {
          await queue.add(
            CERTIFICATE_PREVIEW_JOB,
            { certificateId, revision },
            {
              jobId: revision,
              attempts: 1,
              removeOnComplete: true,
              removeOnFail: { age: 120, count: 32 },
              stackTraceLimit: 0,
            },
          );
        }
        return { imagePath: null };
      } finally {
        if (existing) {
          await redis.runCommand(RETRY_COMMAND, [...retryArgs, 'release', retryToken, revision]);
        }
      }
    });
  }

  read(certificateId: string, token: string): Promise<Buffer | null> {
    return this.withAuthorizedSource(certificateId, token, (revision) => this.cache.read(revision));
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  private async withAuthorizedSource<T>(
    certificateId: string,
    token: string,
    useSource: (revision: string) => Promise<T | null>,
  ): Promise<T | null> {
    if (this.activeOperations >= MAX_HTTP_OPERATIONS) {
      return null;
    }

    const issuedAt = this.authorizedIssueDate(certificateId, token);
    if (issuedAt === null) {
      return null;
    }

    this.activeOperations++;
    try {
      const source = await findCertificatePreviewSource(this.prisma, certificateId);
      if (!source || source.issuedAt.getTime() !== issuedAt) {
        return null;
      }
      return await useSource(source.revision);
    } catch {
      // Storage/queue outages are optional feature failures. They must never
      // propagate into certificate verification or trigger a render inline.
      return null;
    } finally {
      this.activeOperations--;
    }
  }

  private authorizedIssueDate(certificateId: string, token: string): number | null {
    const key = this.signingKey();
    if (!key || !isCertificatePreviewId(certificateId) || token.length > 80) {
      return null;
    }
    const parts = /^(\d{1,14})\.(\d{1,14})\.([A-Za-z0-9_-]{43})$/.exec(token);
    if (!parts || Number(parts[2]) <= Date.now()) {
      return null;
    }
    const signature = this.sign(key, certificateId, `${parts[1]}.${parts[2]}`);
    return timingSafeEqual(signature, Buffer.from(parts[3], 'base64url')) ? Number(parts[1]) : null;
  }

  private signingKey(): string | null {
    if (process.env.CERTIFICATE_PREVIEW_ENABLED !== 'true' || !this.cache.enabled) {
      return null;
    }
    return process.env.CERTIFICATE_PREVIEW_SIGNING_KEY?.trim() || process.env.TURNSTILE_SECRET_KEY?.trim() || null;
  }

  private sign(key: string, certificateId: string, payload: string): Buffer {
    return createHmac('sha256', key).update(`certificate-preview-v1:${certificateId}:${payload}`).digest();
  }

  private getQueue(): Queue<CertificatePreviewJob> | undefined {
    if (!this.queue) {
      if (Date.now() < this.nextConnectionAttempt) {
        return undefined;
      }
      const queue = new Queue<CertificatePreviewJob>(CERTIFICATE_PREVIEW_QUEUE, {
        connection: {
          ...getRedisConnectionOptions(),
          lazyConnect: true,
          connectTimeout: 1500,
          enableOfflineQueue: false,
          autoResendUnfulfilledCommands: false,
          maxRetriesPerRequest: 1,
          commandTimeout: 1500,
        },
        prefix: process.env.BACKEND_E2E_QUEUE_PREFIX,
      });
      this.queue = queue;
      queue.on('error', () => {
        // A connection outage is represented by an unavailable preview.
      });
      void queue.client.catch(() => {
        this.nextConnectionAttempt = Date.now() + 5000;
        this.queue = undefined;
        this.admissionRegistered = false;
        return queue.close().catch(() => undefined);
      });
    }
    return this.queue;
  }
}
