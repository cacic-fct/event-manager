import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { CALENDAR_FEED_MAINTENANCE_QUEUE, DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB } from './calendar.models';
import { buildBullMqJobId } from '../queues/bullmq-job-id';

const TIME_ZONE = 'America/Sao_Paulo';

@Injectable()
export class CalendarFeedMaintenanceScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(CALENDAR_FEED_MAINTENANCE_QUEUE)
    private readonly calendarFeedMaintenanceQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.calendarFeedMaintenanceQueue.upsertJobScheduler(
      buildBullMqJobId('calendar', DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB),
      {
        pattern: '0 3 * * 0',
        tz: TIME_ZONE,
      },
      {
        name: DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB,
        data: {},
        opts: {
          removeOnComplete: true,
          removeOnFail: 50,
        },
      },
    );
  }
}
