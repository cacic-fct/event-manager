import { Job } from 'bullmq';
import {
  PRIZE_DRAW_NOTIFICATION_CLEANUP_JOB,
  PRIZE_DRAW_NOTIFICATION_RECONCILE_JOB,
  PRIZE_DRAW_WINNER_JOB,
  PrizeDrawNotificationJob,
  PrizeDrawNotificationJobsService,
} from './prize-draw-notification-jobs.service';
import { PrizeDrawNotificationJobsProcessor } from './prize-draw-notification-jobs.processor';

describe('PrizeDrawNotificationJobsProcessor', () => {
  const jobs = {
    deliverWinner: jest.fn().mockResolvedValue(undefined),
    cleanup: jest.fn().mockResolvedValue(undefined),
    reconcilePending: jest.fn().mockResolvedValue(undefined),
  } as unknown as PrizeDrawNotificationJobsService;
  const processor = new PrizeDrawNotificationJobsProcessor(jobs);

  beforeEach(() => jest.clearAllMocks());

  it('routes winner and cleanup jobs by name', async () => {
    await processor.process(job(PRIZE_DRAW_WINNER_JOB, { spinId: 'spin-1' }));
    await processor.process(job(PRIZE_DRAW_NOTIFICATION_CLEANUP_JOB, { spinId: 'spin-2' }));

    expect(jobs.deliverWinner).toHaveBeenCalledWith('spin-1');
    expect(jobs.cleanup).toHaveBeenCalledWith('spin-2');
  });

  it('runs reconciliation without requiring a spin id', async () => {
    await processor.process(job(PRIZE_DRAW_NOTIFICATION_RECONCILE_JOB, { spinId: '' }));
    expect(jobs.reconcilePending).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed and unsupported jobs', async () => {
    await expect(processor.process(job(PRIZE_DRAW_WINNER_JOB, { spinId: '' }))).rejects.toThrow(
      'Malformed prize draw notification job.',
    );
    await expect(processor.process(job('unknown', { spinId: 'spin-1' }))).rejects.toThrow(
      'Unsupported prize draw notification job: unknown.',
    );
  });
});

function job(name: string, data: PrizeDrawNotificationJob): Job<PrizeDrawNotificationJob> {
  return { name, data } as Job<PrizeDrawNotificationJob>;
}
