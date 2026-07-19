import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnlineAttendanceNotificationJobsService } from './online-attendance-notification-jobs.service';

@Injectable()
export class OnlineAttendanceNotificationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OnlineAttendanceNotificationScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private reconciling = false;

  constructor(private readonly jobs: OnlineAttendanceNotificationJobsService) {}

  onModuleInit(): void {
    void this.reconcilePendingEvents();
    this.timer = setInterval(() => {
      void this.reconcilePendingEvents();
    }, 60_000);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async reconcilePendingEvents(): Promise<void> {
    if (this.reconciling) {
      return;
    }

    this.reconciling = true;
    try {
      await this.jobs.schedulePendingEvents();
    } catch (error) {
      this.logger.warn(
        `Could not reconcile online attendance notification jobs: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.reconciling = false;
    }
  }
}
