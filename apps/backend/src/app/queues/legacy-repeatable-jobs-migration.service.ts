import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import { CALENDAR_FEED_MAINTENANCE_QUEUE } from '../calendar/calendar.models';
import { CERTIFICATE_NOTIFICATION_QUEUE } from '../certificate/certificate-notification-jobs.service';
import { DASHBOARD_INSIGHTS_QUEUE } from '../dashboard/insights.service';
import { MAJOR_EVENT_RECEIPTS_QUEUE } from '../major-event-receipts/receipt.types';
import { PUBLIC_PLATFORM_STATS_QUEUE } from '../public-platform-stats/public-platform-stats.service';
import { PUBLICATION_QUEUE } from '../publishing/publishing.constants';
import { WEATHER_QUEUE, WeatherService } from '../weather/weather.service';

type LegacyRepeatableJob = {
  key: string;
};

type LegacyRepeatableQueue = {
  getRepeatableJobs?: () => Promise<LegacyRepeatableJob[]>;
  removeRepeatableByKey?: (key: string) => Promise<boolean>;
};

type QueueRegistration = {
  name: string;
  queue: Queue;
};

@Injectable()
export class LegacyRepeatableJobsMigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LegacyRepeatableJobsMigrationService.name);

  constructor(
    @InjectQueue(CALENDAR_FEED_MAINTENANCE_QUEUE)
    private readonly calendarQueue: Queue,
    @InjectQueue(CERTIFICATE_NOTIFICATION_QUEUE)
    private readonly certificateNotificationQueue: Queue,
    @InjectQueue(DASHBOARD_INSIGHTS_QUEUE)
    private readonly dashboardInsightsQueue: Queue,
    @InjectQueue(MAJOR_EVENT_RECEIPTS_QUEUE)
    private readonly receiptQueue: Queue,
    @InjectQueue(PUBLIC_PLATFORM_STATS_QUEUE)
    private readonly publicPlatformStatsQueue: Queue,
    @InjectQueue(PUBLICATION_QUEUE)
    private readonly publicationQueue: Queue,
    @InjectQueue(WEATHER_QUEUE)
    private readonly weatherQueue: Queue,
    private readonly weather: WeatherService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const registrations: QueueRegistration[] = [
      { name: CALENDAR_FEED_MAINTENANCE_QUEUE, queue: this.calendarQueue },
      { name: CERTIFICATE_NOTIFICATION_QUEUE, queue: this.certificateNotificationQueue },
      { name: DASHBOARD_INSIGHTS_QUEUE, queue: this.dashboardInsightsQueue },
      { name: MAJOR_EVENT_RECEIPTS_QUEUE, queue: this.receiptQueue },
      { name: PUBLIC_PLATFORM_STATS_QUEUE, queue: this.publicPlatformStatsQueue },
      { name: PUBLICATION_QUEUE, queue: this.publicationQueue },
      { name: WEATHER_QUEUE, queue: this.weatherQueue },
    ];
    const legacyJobs = await Promise.all(
      registrations.map(async (registration) => ({
        registration,
        jobs: await this.getLegacyRepeatableJobs(registration.queue),
      })),
    );
    const weatherLegacyJobs = legacyJobs.find(({ registration }) => registration.name === WEATHER_QUEUE)?.jobs ?? [];

    if (weatherLegacyJobs.length > 0) {
      await this.weather.scheduleUpcomingEventRefreshes();
    }

    const removals = legacyJobs.flatMap(({ registration, jobs }) =>
      jobs.map((job) => this.removeLegacyRepeatableJob(registration, job.key)),
    );
    await Promise.all(removals);
  }

  private async getLegacyRepeatableJobs(queue: Queue): Promise<LegacyRepeatableJob[]> {
    const legacyQueue = queue as unknown as LegacyRepeatableQueue;
    if (typeof legacyQueue.getRepeatableJobs !== 'function') {
      return [];
    }
    return legacyQueue.getRepeatableJobs();
  }

  private async removeLegacyRepeatableJob(registration: QueueRegistration, key: string): Promise<void> {
    const legacyQueue = registration.queue as unknown as LegacyRepeatableQueue;
    if (typeof legacyQueue.removeRepeatableByKey !== 'function') {
      return;
    }
    const removed = await legacyQueue.removeRepeatableByKey(key);
    if (!removed) {
      this.logger.warn(`Legacy repeatable job ${key} was already missing from ${registration.name}.`);
    }
  }
}
