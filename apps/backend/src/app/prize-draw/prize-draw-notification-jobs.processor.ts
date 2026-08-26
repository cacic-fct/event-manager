import { Processor, WorkerHost } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  PRIZE_DRAW_NOTIFICATION_CLEANUP_JOB,
  PRIZE_DRAW_NOTIFICATION_QUEUE,
  PRIZE_DRAW_NOTIFICATION_RECONCILE_JOB,
  PRIZE_DRAW_WINNER_JOB,
  PrizeDrawNotificationJob,
  PrizeDrawNotificationJobsService,
} from './prize-draw-notification-jobs.service';

@Processor(PRIZE_DRAW_NOTIFICATION_QUEUE)
export class PrizeDrawNotificationJobsProcessor extends WorkerHost {
  constructor(private readonly jobs: PrizeDrawNotificationJobsService) {
    super();
  }

  async process(job: Job<PrizeDrawNotificationJob>): Promise<void> {
    if (job.name === PRIZE_DRAW_NOTIFICATION_RECONCILE_JOB) {
      await this.jobs.reconcilePending();
      return;
    }
    if (!job.data || typeof job.data.spinId !== 'string' || !job.data.spinId.trim()) {
      throw new BadRequestException('Malformed prize draw notification job.');
    }
    if (job.name === PRIZE_DRAW_WINNER_JOB) {
      await this.jobs.deliverWinner(job.data.spinId);
      return;
    }
    if (job.name === PRIZE_DRAW_NOTIFICATION_CLEANUP_JOB) {
      await this.jobs.cleanup(job.data.spinId);
      return;
    }
    throw new BadRequestException(`Unsupported prize draw notification job: ${job.name}.`);
  }
}
