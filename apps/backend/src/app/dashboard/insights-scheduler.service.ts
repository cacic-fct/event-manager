import { Injectable, OnModuleInit } from '@nestjs/common';
import { DashboardInsightsService } from './insights.service';

@Injectable()
export class DashboardInsightsSchedulerService implements OnModuleInit {
  constructor(private readonly insightsService: DashboardInsightsService) {}

  async onModuleInit(): Promise<void> {
    await this.insightsService.scheduleRefreshJobs();
  }
}
