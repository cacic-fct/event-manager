import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NovuNotificationsService } from '../notifications/novu-notifications.service';
import { CertificateRecord } from './certificate.constants';

export const CERTIFICATE_NOTIFICATION_QUEUE = 'certificate-notifications';
export const CERTIFICATE_AVAILABLE_NOTIFICATION_JOB = 'notify-certificate-available';

export interface CertificateAvailableNotificationJob {
  certificateId: string;
  configId: string;
  certificateName: string;
  targetName: string | null;
  issuedAt: string;
  recipient: ReturnType<NovuNotificationsService['mapPersonToRecipient']>;
}

@Injectable()
export class CertificateNotificationJobsService {
  constructor(
    @InjectQueue(CERTIFICATE_NOTIFICATION_QUEUE)
    private readonly queue: Queue<CertificateAvailableNotificationJob>,
    @Optional() private readonly notifications?: NovuNotificationsService,
  ) {}

  async enqueue(certificate: CertificateRecord): Promise<void> {
    const input = createCertificateAvailableNotification(this.notifications, certificate);
    if (!input) {
      return;
    }

    await this.queue.add(CERTIFICATE_AVAILABLE_NOTIFICATION_JOB, input, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
      jobId: `certificate-available:${certificate.id}:${certificate.issuedAt.toISOString()}`,
      removeOnComplete: true,
      removeOnFail: 50,
    });
  }

  async deliver(input: CertificateAvailableNotificationJob): Promise<void> {
    if (!this.notifications) {
      return;
    }

    await this.notifications.notifyCertificateAvailable({
      ...input,
      issuedAt: new Date(input.issuedAt),
    });
  }
}

function createCertificateAvailableNotification(
  notifications: NovuNotificationsService | undefined,
  certificate: CertificateRecord,
): CertificateAvailableNotificationJob | null {
  if (!notifications) {
    return null;
  }

  return {
    certificateId: certificate.id,
    configId: certificate.configId,
    certificateName: certificate.config.name,
    targetName: getCertificateTargetName(certificate),
    issuedAt: certificate.issuedAt.toISOString(),
    recipient: notifications.mapPersonToRecipient(certificate.person),
  };
}

function getCertificateTargetName(certificate: CertificateRecord): string | null {
  return certificate.config.event?.name ?? certificate.config.eventGroup?.name ?? certificate.config.majorEvent?.name ?? certificate.config.folder?.name ?? null;
}
