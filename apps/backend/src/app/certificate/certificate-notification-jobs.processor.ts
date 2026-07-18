import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  CertificateAvailableNotificationJob,
  CertificateNotificationJobsService,
  CERTIFICATE_AVAILABLE_NOTIFICATION_JOB,
  CERTIFICATE_NOTIFICATION_QUEUE,
} from './certificate-notification-jobs.service';

@Processor(CERTIFICATE_NOTIFICATION_QUEUE)
export class CertificateNotificationJobsProcessor extends WorkerHost {
  constructor(private readonly jobs: CertificateNotificationJobsService) {
    super();
  }

  async process(job: Job<CertificateAvailableNotificationJob>): Promise<void> {
    if (job.name === CERTIFICATE_AVAILABLE_NOTIFICATION_JOB) {
      await this.jobs.deliver(job.data);
    }
  }
}
