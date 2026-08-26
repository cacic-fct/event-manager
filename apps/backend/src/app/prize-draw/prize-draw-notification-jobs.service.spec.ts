import {
  PRIZE_DRAW_NOTIFICATION_CLEANUP_JOB,
  PRIZE_DRAW_PRESENTATION_GRACE_MS,
  PRIZE_DRAW_PRESENTATION_RECONCILIATION_WINDOW_MS,
  PrizeDrawNotificationJobsService,
  PRIZE_DRAW_PRESENTATION_JOB,
  PRIZE_DRAW_WINNER_JOB,
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

  it('re-publishes an already acknowledged presentation without re-enqueueing its winner notification', async () => {
    const context = createContext();
    context.prisma.prizeDrawSpin.updateMany.mockResolvedValue({ count: 0 });
    context.prisma.prizeDrawSpin.findUnique
      .mockResolvedValueOnce({
        drawId: 'draw-1',
        undoneAt: null,
        presentationAcknowledgedAt: new Date(),
        notificationStatus: 'PENDING',
        notificationTransactionId: 'winner-transaction',
        draw: { revision: 4 },
      })
      .mockResolvedValueOnce(null);

    await expect(context.service.releasePresentation('spin-1')).resolves.toBe(true);
    await expect(context.service.releasePresentation('missing')).resolves.toBe(false);

    expect(context.queue.add).not.toHaveBeenCalled();
    expect(context.realtime.publishDraw).toHaveBeenCalledWith('draw-1', 'SPIN_PRESENTED', 4, 'spin-1');
  });

  it('does not publish an undone spin even when it had already been acknowledged', async () => {
    const context = createContext();
    context.prisma.prizeDrawSpin.updateMany.mockResolvedValue({ count: 0 });
    context.prisma.prizeDrawSpin.findUnique.mockResolvedValue({
      drawId: 'draw-1',
      undoneAt: new Date(),
      presentationAcknowledgedAt: new Date(),
      notificationStatus: 'PENDING',
      notificationTransactionId: 'winner-transaction',
      draw: { revision: 4 },
    });

    await expect(context.service.releasePresentation('spin-1')).resolves.toBe(false);

    expect(context.queue.add).not.toHaveBeenCalled();
    expect(context.realtime.publishDraw).not.toHaveBeenCalled();
  });

  it('delivers an acknowledged winner once while holding the draw lock', async () => {
    const context = createContext();
    context.prisma.prizeDrawSpin.findUnique.mockResolvedValueOnce({ drawId: 'draw-1' });
    context.tx.prizeDrawSpin.findUnique.mockResolvedValue(notificationRecord());
    context.notifications.notifyPrizeDrawWinner.mockResolvedValue(true);

    await context.service.deliverWinner('spin-1');

    expect(context.tx.$queryRaw).toHaveBeenCalled();
    expect(context.notifications.notifyPrizeDrawWinner).toHaveBeenCalledWith({
      drawId: 'draw-1',
      spinId: 'spin-1',
      drawTitle: 'Sorteio',
      spinDescription: 'Primeiro prêmio',
      targetType: 'EVENT',
      targetId: 'event-1',
      recipient: expect.objectContaining({ subscriberId: 'user-1' }),
      transactionId: 'winner-transaction',
    });
    expect(context.tx.prizeDrawSpin.update).toHaveBeenCalledWith({
      where: { id: 'spin-1' },
      data: { notificationStatus: 'SENT' },
    });
  });

  it('cancels an undone pending delivery and fails retryably when Novu does not acknowledge', async () => {
    const context = createContext();
    context.prisma.prizeDrawSpin.findUnique.mockResolvedValue({ drawId: 'draw-1' });
    context.tx.prizeDrawSpin.findUnique.mockResolvedValue(notificationRecord({ undoneAt: new Date() }));

    await context.service.deliverWinner('spin-1');
    expect(context.tx.prizeDrawSpin.updateMany).toHaveBeenCalledWith({
      where: { id: 'spin-1', notificationStatus: 'PENDING' },
      data: { notificationStatus: 'CANCELLED' },
    });
    expect(context.notifications.notifyPrizeDrawWinner).not.toHaveBeenCalled();

    context.tx.prizeDrawSpin.findUnique.mockResolvedValue(notificationRecord());
    context.notifications.notifyPrizeDrawWinner.mockResolvedValue(false);
    await expect(context.service.deliverWinner('spin-1')).rejects.toThrow('did not acknowledge');
    expect(context.tx.prizeDrawSpin.update).not.toHaveBeenCalled();
  });

  it('cancels and deletes winner messages, sends undo notification only for a sent winner, and schedules retention cleanup', async () => {
    const context = createContext();
    const job = { remove: jest.fn().mockResolvedValue(undefined) };
    context.queue.getJob.mockResolvedValue(job);
    context.prisma.prizeDrawSpin.findUnique.mockResolvedValue(notificationRecord({ notificationStatus: 'SENT' }));
    context.notifications.cancelTriggeredNotification.mockResolvedValue(true);
    context.notifications.deleteNotificationMessages.mockResolvedValue(true);
    context.notifications.notifyPrizeDrawUndone.mockResolvedValue(true);

    await context.service.undoSpin('spin-1');

    expect(job.remove).toHaveBeenCalled();
    expect(context.notifications.notifyPrizeDrawUndone).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'prize-draw-undone:draw-1:1' }),
    );
    expect(context.prisma.prizeDrawSpin.update).toHaveBeenCalledWith({
      where: { id: 'spin-1' },
      data: {
        notificationStatus: 'CANCELLED',
        undoNotificationTransactionId: 'prize-draw-undone:draw-1:1',
        undoNotificationStatus: 'SENT',
      },
    });
    expect(context.queue.add).toHaveBeenCalledWith(
      PRIZE_DRAW_NOTIFICATION_CLEANUP_JOB,
      { spinId: 'spin-1' },
      expect.objectContaining({ delay: 60_000 }),
    );
  });

  it('marks cleanup complete only after every related Novu message is deleted', async () => {
    const context = createContext();
    context.prisma.prizeDrawSpin.findUnique.mockResolvedValue({
      notificationTransactionId: 'winner-transaction',
      undoNotificationTransactionId: 'undo-transaction',
    });
    context.notifications.deleteNotificationMessages.mockResolvedValue(true);

    await context.service.cleanup('spin-1');
    expect(context.notifications.deleteNotificationMessages).toHaveBeenCalledTimes(2);
    expect(context.prisma.prizeDrawSpin.update).toHaveBeenCalledWith({
      where: { id: 'spin-1' },
      data: { notificationStatus: 'DELETED', undoNotificationStatus: 'DELETED' },
    });

    context.notifications.deleteNotificationMessages
      .mockReset()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(context.service.cleanup('spin-1')).rejects.toThrow('Could not delete every Novu message');
  });

  it('reconciles an unpublished spin using its remaining animation time', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-26T18:00:00.000Z'));
    try {
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

      expect(context.prisma.prizeDrawSpin.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            drawnAt: { gte: new Date(now.getTime() - PRIZE_DRAW_PRESENTATION_RECONCILIATION_WINDOW_MS) },
          }),
        }),
      );
      expect(context.queue.add).toHaveBeenCalledWith(
        PRIZE_DRAW_PRESENTATION_JOB,
        { spinId: 'spin-1' },
        expect.objectContaining({ delay: 4_500 + PRIZE_DRAW_PRESENTATION_GRACE_MS }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('reconciles pending winner and undone cleanup jobs alongside presentation jobs', async () => {
    const context = createContext();
    context.prisma.prizeDrawSpin.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'spin-pending' }])
      .mockResolvedValueOnce([{ id: 'spin-undone' }]);

    await context.service.reconcilePending();

    expect(context.queue.add).toHaveBeenCalledWith(
      PRIZE_DRAW_WINNER_JOB,
      { spinId: 'spin-pending' },
      expect.objectContaining({ delay: 0 }),
    );
    expect(context.queue.add).toHaveBeenCalledWith(
      PRIZE_DRAW_NOTIFICATION_CLEANUP_JOB,
      { spinId: 'spin-undone' },
      expect.objectContaining({ delay: 0 }),
    );
  });

  it('registers the minute reconciliation scheduler and contains queue failures', async () => {
    const context = createContext();
    await context.service.onModuleInit();
    expect(context.queue.upsertJobScheduler).toHaveBeenCalledWith(
      expect.any(String),
      { pattern: '* * * * *' },
      expect.objectContaining({ name: 'reconcile-prize-draw-notifications' }),
    );

    context.queue.add.mockRejectedValue(new Error('Redis offline'));
    context.prisma.prizeDrawSpin.updateMany.mockResolvedValue({ count: 1 });
    await expect(context.service.enqueueWinner('spin-1', { delayMs: -10 })).resolves.toBeUndefined();
    await expect(context.service.enqueuePresentation('spin-1', { delayMs: -10 })).resolves.toBeUndefined();
    expect(context.prisma.prizeDrawSpin.updateMany).toHaveBeenCalledWith({
      where: { id: 'spin-1', notificationStatus: 'PENDING' },
      data: { notificationStatus: 'PENDING' },
    });
  });
});

function createContext() {
  const queue = {
    add: jest.fn().mockResolvedValue(undefined),
    upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
    getJob: jest.fn(),
  };
  const notifications = {
    notifyPrizeDrawWinner: jest.fn(),
    notifyPrizeDrawUndone: jest.fn(),
    cancelTriggeredNotification: jest.fn(),
    deleteNotificationMessages: jest.fn(),
    mapPersonToRecipient: jest.fn((person: { userId: string }) => ({ subscriberId: person.userId })),
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(undefined),
    prizeDrawSpin: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    prizeDrawSpin: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
  const realtime = { publishDraw: jest.fn().mockResolvedValue(undefined) };
  const service = new PrizeDrawNotificationJobsService(
    queue as never,
    notifications as never,
    prisma as never,
    realtime as never,
  );
  return { notifications, prisma, queue, realtime, service, tx };
}

function notificationRecord(patch: Record<string, unknown> = {}) {
  return {
    id: 'spin-1',
    drawId: 'draw-1',
    sequence: 1,
    description: 'Primeiro prêmio',
    undoneAt: null,
    presentationAcknowledgedAt: new Date(),
    notificationTransactionId: 'winner-transaction',
    notificationStatus: 'PENDING',
    winnerPerson: {
      id: 'person-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
      userId: 'user-1',
      user: null,
      mergedInto: null,
    },
    draw: {
      title: 'Sorteio',
      targetType: 'EVENT',
      eventId: 'event-1',
      majorEventId: null,
    },
    ...patch,
  };
}
