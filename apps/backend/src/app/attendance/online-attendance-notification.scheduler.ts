import { Injectable, OnModuleInit } from '@nestjs/common';
import { OnlineAttendanceNotificationJobsService } from './online-attendance-notification-jobs.service';

@Injectable()
export class OnlineAttendanceNotificationScheduler implements OnModuleInit {
  constructor(private readonly jobs: OnlineAttendanceNotificationJobsService) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.schedulePendingEvents();
  }
}
