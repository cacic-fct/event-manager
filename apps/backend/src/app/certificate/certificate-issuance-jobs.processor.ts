import { Processor, WorkerHost } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  CertificateIssuanceJobsService,
  CERTIFICATE_ISSUANCE_QUEUE,
  ISSUE_CERTIFICATES_JOB,
  RECOVER_CERTIFICATE_ISSUANCE_JOB,
  RECONCILE_CERTIFICATE_ELIGIBILITY_JOB,
  type CertificateIssuanceJobData,
} from './certificate-issuance-jobs.service';

@Processor(CERTIFICATE_ISSUANCE_QUEUE, { concurrency: 1 })
export class CertificateIssuanceJobsProcessor extends WorkerHost {
  constructor(private readonly jobs: CertificateIssuanceJobsService) {
    super();
  }

  async process(job: Job<CertificateIssuanceJobData>): Promise<void> {
    switch (job.name) {
      case RECOVER_CERTIFICATE_ISSUANCE_JOB:
        return this.jobs.recoverPending();
      case RECONCILE_CERTIFICATE_ELIGIBILITY_JOB:
        return this.jobs.reconcileEligibility();
      case ISSUE_CERTIFICATES_JOB:
        if (typeof job.data?.runId !== 'string' || !job.data.runId.trim()) {
          throw new BadRequestException('Invalid certificate issuance payload.');
        }
        return this.jobs.process(job.data.runId, job.attemptsMade + 1 >= (job.opts.attempts ?? 1));
      default:
        throw new BadRequestException(`Unsupported certificate issuance job: ${job.name}.`);
    }
  }
}
