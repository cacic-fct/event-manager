import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { CALENDAR_FEED_MAINTENANCE_QUEUE, DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB } from './calendar.models';

const TIME_ZONE = 'America/Sao_Paulo';

@Injectable()
export class CalendarFeedMaintenanceScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(CALENDAR_FEED_MAINTENANCE_QUEUE)
    private readonly calendarFeedMaintenanceQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.calendarFeedMaintenanceQueue.add(
      DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB,
      {},
      {
        jobId: `calendar:${DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB}`,
        repeat: {
          pattern: '0 3 * * 0',
          tz: TIME_ZONE,
        },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  }
}
