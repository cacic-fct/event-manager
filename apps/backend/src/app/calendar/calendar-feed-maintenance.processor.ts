import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CALENDAR_FEED_MAINTENANCE_QUEUE, DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB } from './calendar.models';
import { CalendarService } from './calendar.service';

@Processor(CALENDAR_FEED_MAINTENANCE_QUEUE)
export class CalendarFeedMaintenanceProcessor extends WorkerHost {
  constructor(private readonly calendars: CalendarService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB) {
      await this.calendars.runAdminCalendarFeedMaintenance();
    }
  }
}
