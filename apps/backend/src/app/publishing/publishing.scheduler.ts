import { Injectable, OnModuleInit } from '@nestjs/common';
import { PublicationJobsService } from './publishing-jobs.service';

@Injectable()
export class PublicationScheduler implements OnModuleInit {
  constructor(private readonly publicationJobs: PublicationJobsService) {}

  async onModuleInit(): Promise<void> {
    await this.publicationJobs.schedulePublicationJobs();
  }
}
