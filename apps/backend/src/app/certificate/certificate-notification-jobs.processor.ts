import { Processor, WorkerHost } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  CertificateAvailableNotificationJob,
  CertificateNotificationJobsService,
  CERTIFICATE_AVAILABLE_NOTIFICATION_JOB,
  CERTIFICATE_NOTIFICATION_RECONCILE_JOB,
  CERTIFICATE_NOTIFICATION_QUEUE,
} from './certificate-notification-jobs.service';

@Processor(CERTIFICATE_NOTIFICATION_QUEUE)
export class CertificateNotificationJobsProcessor extends WorkerHost {
  constructor(private readonly jobs: CertificateNotificationJobsService) {
    super();
  }

  async process(job: Job<CertificateAvailableNotificationJob | Record<string, never>>): Promise<void> {
    if (job.name === CERTIFICATE_NOTIFICATION_RECONCILE_JOB) {
      await this.jobs.reconcilePending();
      return;
    }
    if (job.name !== CERTIFICATE_AVAILABLE_NOTIFICATION_JOB) {
      throw new BadRequestException(`Unsupported certificate notification job: ${job.name}.`);
    }
    if (!isCertificateNotificationJob(job.data)) {
      throw new BadRequestException('Malformed certificate notification job payload.');
    }
    await this.jobs.deliver(job.data);
  }
}

function isCertificateNotificationJob(value: unknown): value is CertificateAvailableNotificationJob {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const hasText = (field: unknown): field is string => typeof field === 'string' && field.trim().length > 0;
  return (
    hasText(candidate['outboxId']) &&
    hasText(candidate['certificateId']) &&
    hasText(candidate['configId']) &&
    hasText(candidate['certificateName']) &&
    hasText(candidate['issuedAt']) &&
    Number.isFinite(Date.parse(candidate['issuedAt'])) &&
    (candidate['targetName'] === null || hasText(candidate['targetName'])) &&
    Boolean(candidate['recipient']) &&
    typeof candidate['recipient'] === 'object'
  );
}
