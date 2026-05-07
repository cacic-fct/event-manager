import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  DASHBOARD_INSIGHTS_QUEUE,
  DashboardInsightsService,
} from './insights.service';

@Processor(DASHBOARD_INSIGHTS_QUEUE)
export class DashboardInsightsProcessor extends WorkerHost {
  constructor(private readonly insightsService: DashboardInsightsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (
      job.name === 'refresh-realtime-dashboard-insights' ||
      job.name === 'refresh-operational-dashboard-insights'
    ) {
      await this.insightsService.invalidateCachedInsights();
    }
  }
}
