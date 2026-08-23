import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { NovuNotificationsService } from '../notifications/novu-notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateRecord } from './certificate.constants';
import { buildBullMqJobId } from '../queues/bullmq-job-id';

export const CERTIFICATE_NOTIFICATION_QUEUE = 'certificate-notifications';
export const CERTIFICATE_AVAILABLE_NOTIFICATION_JOB = 'notify-certificate-available';
export const CERTIFICATE_NOTIFICATION_RECONCILE_JOB = 'reconcile-certificate-notifications';
const OUTBOX_LEASE_MS = 5 * 60 * 1_000;
const OUTBOX_RETRY_BASE_MS = 30 * 1_000;

export interface CertificateAvailableNotificationJob {
  outboxId: string;
  certificateId: string;
  configId: string;
  certificateName: string;
  targetName: string | null;
  issuedAt: string;
  recipient: ReturnType<NovuNotificationsService['mapPersonToRecipient']>;
}

type CertificateNotificationProjection = {
  id: string;
  configId: string;
  issuedAt: Date;
  person: CertificateRecord['person'];
  config: {
    id: string;
    name: string;
    event: { name: string } | null;
    eventGroup: { name: string } | null;
    majorEvent: { name: string } | null;
    folder: { name: string } | null;
  };
};

@Injectable()
export class CertificateNotificationJobsService implements OnModuleInit {
  constructor(
    @InjectQueue(CERTIFICATE_NOTIFICATION_QUEUE)
    private readonly queue: Queue<CertificateAvailableNotificationJob | Record<string, never>>,
    @Optional() private readonly notifications?: NovuNotificationsService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      buildBullMqJobId('certificate-notification', 'reconcile'),
      { pattern: '* * * * *' },
      {
        name: CERTIFICATE_NOTIFICATION_RECONCILE_JOB,
        data: {},
        opts: {
          removeOnComplete: true,
          removeOnFail: 50,
        },
      },
    );
  }

  async createPendingOutbox(
    certificate: CertificateRecord,
    client: Prisma.TransactionClient | PrismaService,
  ): Promise<void> {
    if (!this.notifications) {
      return;
    }
    await client.certificateNotificationOutbox.updateMany({
      where: {
        certificateId: certificate.id,
        issuedAt: { not: certificate.issuedAt },
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      data: {
        status: 'SUPERSEDED',
        lastError: 'Superseded by a newer certificate issuance.',
      },
    });
    await client.certificateNotificationOutbox.upsert({
      where: {
        certificateId_issuedAt: {
          certificateId: certificate.id,
          issuedAt: certificate.issuedAt,
        },
      },
      create: {
        certificateId: certificate.id,
        issuedAt: certificate.issuedAt,
      },
      update: {
        status: 'PENDING',
        nextAttemptAt: new Date(),
        lastError: null,
        deliveredAt: null,
      },
    });
  }

  async enqueue(certificate: CertificateRecord): Promise<void> {
    const input = createCertificateAvailableNotification(this.notifications, certificate);
    if (!input) {
      return;
    }

    if (!this.prisma) {
      return;
    }
    const outbox = await this.prisma.certificateNotificationOutbox.findUnique({
          where: {
            certificateId_issuedAt: {
              certificateId: certificate.id,
              issuedAt: certificate.issuedAt,
            },
          },
          select: { id: true },
        });
    if (!outbox) {
      return;
    }

    const claim = await this.claimOutbox(outbox.id);
    if (!claim) {
      return;
    }
    try {
      await this.enqueueClaimed(claim.id, claim.attempts, input);
    } catch (error: unknown) {
      await this.markOutboxFailure(claim.id, error);
      throw error;
    }
  }

  async deliver(input: CertificateAvailableNotificationJob): Promise<void> {
    if (!this.notifications) {
      return;
    }

    if (this.prisma) {
      const outbox = await this.prisma.certificateNotificationOutbox.findUnique({
        where: { id: input.outboxId },
        select: { status: true },
      });
      if (!outbox || outbox.status === 'SUPERSEDED' || outbox.status === 'DELIVERED') {
        return;
      }
    }
    try {
      const delivered = await this.notifications.notifyCertificateAvailable({
        ...input,
        issuedAt: new Date(input.issuedAt),
      });
      if (!delivered) {
        throw new Error(`Certificate notification for certificate ${input.certificateId} was not acknowledged.`);
      }
      if (this.prisma) {
        await this.prisma.certificateNotificationOutbox.updateMany({
          where: { id: input.outboxId, status: { in: ['PROCESSING', 'PENDING'] } },
          data: { status: 'DELIVERED', deliveredAt: new Date(), lastError: null },
        });
      }
    } catch (error: unknown) {
      await this.markOutboxFailure(input.outboxId, error);
    }
  }

  async reconcilePending(): Promise<void> {
    if (!this.prisma || !this.notifications) {
      return;
    }
    const pending = await this.prisma.certificateNotificationOutbox.findMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
        nextAttemptAt: { lte: new Date() },
      },
      select: {
        id: true,
        issuedAt: true,
        attempts: true,
        certificate: {
          select: {
            id: true,
            config: {
              select: {
                id: true,
                name: true,
                event: { select: { name: true } },
                eventGroup: { select: { name: true } },
                majorEvent: { select: { name: true } },
                folder: { select: { name: true } },
              },
            },
            person: true,
          },
        },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: 100,
    });
    await Promise.allSettled(
      pending.map(async (item) => {
        const claim = await this.claimOutbox(item.id);
        if (!claim) return;
        const certificate: CertificateNotificationProjection = {
          ...item.certificate,
          configId: item.certificate.config.id,
          issuedAt: item.issuedAt,
        };
        const input = createCertificateAvailableNotification(this.notifications, certificate, item.issuedAt);
        if (!input) return;
        try {
          await this.enqueueClaimed(claim.id, claim.attempts, input);
        } catch (error: unknown) {
          await this.markOutboxFailure(claim.id, error);
        }
      }),
    );
  }

  private async claimOutbox(id: string): Promise<{ id: string; attempts: number } | null> {
    if (!this.prisma) return null;
    const now = new Date();
    const updated = await this.prisma.certificateNotificationOutbox.updateMany({
      where: {
        id,
        OR: [
          { status: 'PENDING', nextAttemptAt: { lte: now } },
          { status: 'PROCESSING', nextAttemptAt: { lte: now } },
        ],
      },
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
        nextAttemptAt: new Date(Date.now() + OUTBOX_LEASE_MS),
        lastError: null,
      },
    });
    if (updated.count !== 1) return null;
    const claimed = await this.prisma.certificateNotificationOutbox.findUnique({
      where: { id },
      select: { id: true, attempts: true },
    });
    return claimed;
  }

  private async enqueueClaimed(
    outboxId: string,
    attempts: number,
    input: CertificateAvailableNotificationJob,
  ): Promise<void> {
    await this.queue.add(CERTIFICATE_AVAILABLE_NOTIFICATION_JOB, { ...input, outboxId }, {
      jobId: buildBullMqJobId('certificate-available', outboxId, attempts),
      removeOnComplete: true,
      removeOnFail: 50,
    });
  }

  private async markOutboxFailure(id: string, error: unknown): Promise<void> {
    if (!this.prisma) return;
    const current = await this.prisma.certificateNotificationOutbox.findUnique({
      where: { id },
      select: { attempts: true, status: true },
    });
    if (!current || current.status === 'SUPERSEDED' || current.status === 'DELIVERED') return;
    const delay = Math.min(OUTBOX_RETRY_BASE_MS * 2 ** Math.max(current.attempts - 1, 0), 60 * 60 * 1_000);
    await this.prisma.certificateNotificationOutbox.updateMany({
      where: { id, status: 'PROCESSING' },
      data: {
        status: 'PENDING',
        nextAttemptAt: new Date(Date.now() + delay),
        lastError: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function createCertificateAvailableNotification(
  notifications: NovuNotificationsService | undefined,
  certificate: CertificateNotificationProjection,
  issuedAt = certificate.issuedAt,
): CertificateAvailableNotificationJob | null {
  if (!notifications) {
    return null;
  }

  return {
    outboxId: '',
    certificateId: certificate.id,
    configId: certificate.configId,
    certificateName: certificate.config.name,
    targetName: getCertificateTargetName(certificate),
    issuedAt: issuedAt.toISOString(),
    recipient: notifications.mapPersonToRecipient(certificate.person),
  };
}

function getCertificateTargetName(certificate: CertificateNotificationProjection): string | null {
  return (
    certificate.config.event?.name ??
    certificate.config.eventGroup?.name ??
    certificate.config.majorEvent?.name ??
    certificate.config.folder?.name ??
    null
  );
}
