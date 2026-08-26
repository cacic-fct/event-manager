import {
  PRIZE_DRAW_PRESENTATION_GRACE_MS,
  PrizeDrawNotificationJobsService,
  PRIZE_DRAW_PRESENTATION_JOB,
} from './prize-draw-notification-jobs.service';

describe('PrizeDrawNotificationJobsService', () => {
  it('publishes and queues the winner notification when presentation is released', async () => {
    const context = createContext();
    context.prisma.prizeDrawSpin.updateMany.mockResolvedValue({ count: 1 });
    context.prisma.prizeDrawSpin.findUnique.mockResolvedValue({
      drawId: 'draw-1',
      presentationAcknowledgedAt: new Date(),
      notificationStatus: 'PENDING',
      notificationTransactionId: 'winner-transaction',
      draw: { revision: 4 },
    });

    await expect(context.service.releasePresentation('spin-1')).resolves.toBe(true);

    expect(context.queue.add).toHaveBeenCalledWith(
      'notify-prize-draw-winner',
      { spinId: 'spin-1' },
      expect.objectContaining({ delay: 0 }),
    );
    expect(context.realtime.publishDraw).toHaveBeenCalledWith('draw-1', 'SPIN_PRESENTED', 4, 'spin-1');
  });

  it('reconciles an unpublished spin using its remaining animation time', async () => {
    const context = createContext();
    const now = new Date();
    context.prisma.prizeDrawSpin.findMany
      .mockResolvedValueOnce([
        {
          id: 'spin-1',
          drawnAt: new Date(now.getTime() - 1_000),
          countdownSeconds: 3,
          reelDurationMs: 2_000,
          preRevealPauseMs: 500,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await context.service.reconcilePending();

    expect(context.queue.add).toHaveBeenCalledWith(
      PRIZE_DRAW_PRESENTATION_JOB,
      { spinId: 'spin-1' },
      expect.objectContaining({ delay: expect.any(Number) }),
    );
    const options = context.queue.add.mock.calls[0][2];
    expect(options.delay).toBeGreaterThan(4_000 + PRIZE_DRAW_PRESENTATION_GRACE_MS);
    expect(options.delay).toBeLessThanOrEqual(4_500 + PRIZE_DRAW_PRESENTATION_GRACE_MS);
  });
});

function createContext() {
  const queue = { add: jest.fn().mockResolvedValue(undefined), upsertJobScheduler: jest.fn() };
  const notifications = {};
  const prisma = {
    prizeDrawSpin: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const realtime = { publishDraw: jest.fn().mockResolvedValue(undefined) };
  const service = new PrizeDrawNotificationJobsService(
    queue as never,
    notifications as never,
    prisma as never,
    realtime as never,
  );
  return { prisma, queue, realtime, service };
}
