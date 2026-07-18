import { Processor, WorkerHost } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  ONLINE_ATTENDANCE_AVAILABLE_NOTIFICATION_JOB,
  ONLINE_ATTENDANCE_NOTIFICATION_QUEUE,
  OnlineAttendanceAvailableNotificationJob,
  OnlineAttendanceNotificationJobsService,
} from './online-attendance-notification-jobs.service';

@Processor(ONLINE_ATTENDANCE_NOTIFICATION_QUEUE)
export class OnlineAttendanceNotificationJobsProcessor extends WorkerHost {
  constructor(private readonly jobs: OnlineAttendanceNotificationJobsService) {
    super();
  }

  async process(job: Job<OnlineAttendanceAvailableNotificationJob>): Promise<void> {
    if (job.name !== ONLINE_ATTENDANCE_AVAILABLE_NOTIFICATION_JOB) {
      throw new BadRequestException(`Unsupported online attendance notification job: ${job.name}.`);
    }

    await this.jobs.deliver(job.data);
  }
}
