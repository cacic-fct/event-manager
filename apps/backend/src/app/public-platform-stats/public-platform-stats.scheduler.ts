import { Injectable, OnModuleInit } from '@nestjs/common';
import { PublicPlatformStatsService } from './public-platform-stats.service';

@Injectable()
export class PublicPlatformStatsScheduler implements OnModuleInit {
  constructor(private readonly statsService: PublicPlatformStatsService) {}

  async onModuleInit(): Promise<void> {
    await this.statsService.scheduleRefreshJob();
  }
}
