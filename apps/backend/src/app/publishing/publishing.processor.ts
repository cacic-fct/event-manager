import { Processor, WorkerHost } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  PUBLICATION_QUEUE,
  PUBLISH_SCHEDULED_CONTENT_JOB,
  RECONCILE_PUBLICATION_STATES_JOB,
} from './publishing.constants';
import { PublicationJobsService } from './publishing-jobs.service';
import { PublicationJobData, PublicationQueueData } from './publishing.types';

@Processor(PUBLICATION_QUEUE)
export class PublicationProcessor extends WorkerHost {
  constructor(private readonly publicationJobs: PublicationJobsService) {
    super();
  }

  async process(job: Job<PublicationQueueData>): Promise<void> {
    if (job.name === PUBLISH_SCHEDULED_CONTENT_JOB) {
      if (!this.isPublicationJobData(job.data)) {
        throw new BadRequestException(`Invalid publication job payload for ${job.name}.`);
      }
      await this.publicationJobs.processScheduledPublication(job.data);
      return;
    }

    if (job.name === RECONCILE_PUBLICATION_STATES_JOB) {
      await this.publicationJobs.reconcileScheduledPublications();
      return;
    }

    throw new BadRequestException(`Unsupported publication job: ${job.name}.`);
  }

  private isPublicationJobData(data: PublicationQueueData): data is PublicationJobData {
    return 'targetType' in data && 'targetId' in data;
  }
}
