import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PUBLIC_PLATFORM_STATS_QUEUE, PublicPlatformStatsService } from './public-platform-stats.service';

@Processor(PUBLIC_PLATFORM_STATS_QUEUE)
export class PublicPlatformStatsProcessor extends WorkerHost {
  constructor(private readonly statsService: PublicPlatformStatsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'refresh-public-platform-stats') {
      await this.statsService.refreshPublicPlatformStats();
    }
  }
}
