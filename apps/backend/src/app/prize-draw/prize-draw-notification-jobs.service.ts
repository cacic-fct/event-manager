import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { buildBullMqJobId } from '../queues/bullmq-job-id';
import { NovuNotificationsService } from '../notifications/novu-notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { PrizeDrawRealtimeService } from './prize-draw-realtime.service';

export const PRIZE_DRAW_NOTIFICATION_QUEUE = 'prize-draw-notifications';
export const PRIZE_DRAW_WINNER_JOB = 'notify-prize-draw-winner';
export const PRIZE_DRAW_PRESENTATION_JOB = 'publish-prize-draw-result';
export const PRIZE_DRAW_NOTIFICATION_CLEANUP_JOB = 'cleanup-prize-draw-notifications';
export const PRIZE_DRAW_NOTIFICATION_RECONCILE_JOB = 'reconcile-prize-draw-notifications';
const UNDO_NOTIFICATION_RETENTION_MS = 60_000;
export const PRIZE_DRAW_PRESENTATION_GRACE_MS = 750;
export const PRIZE_DRAW_PRESENTATION_RECONCILIATION_WINDOW_MS = 60 * 60 * 1000;

export type PrizeDrawNotificationJob = {
  spinId: string;
};

@Injectable()
export class PrizeDrawNotificationJobsService implements OnModuleInit {
  private readonly logger = new Logger(PrizeDrawNotificationJobsService.name);

  constructor(
    @InjectQueue(PRIZE_DRAW_NOTIFICATION_QUEUE)
    private readonly queue: Queue<PrizeDrawNotificationJob>,
    private readonly notifications: NovuNotificationsService,
    private readonly prisma: PrismaService,
    private readonly realtime: PrizeDrawRealtimeService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      buildBullMqJobId('prize-draw-notification', 'reconcile'),
      { pattern: '* * * * *' },
      {
        name: PRIZE_DRAW_NOTIFICATION_RECONCILE_JOB,
        data: { spinId: '' },
        opts: { removeOnComplete: true, removeOnFail: true },
      },
    );
  }

  async enqueueWinner(spinId: string, options: { delayMs: number }): Promise<void> {
    try {
      await this.queue.add(
        PRIZE_DRAW_WINNER_JOB,
        { spinId },
        {
          jobId: this.winnerJobId(spinId),
          delay: Math.max(0, options.delayMs),
          attempts: 5,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    } catch (error) {
      await this.prisma.prizeDrawSpin.updateMany({
        where: { id: spinId, notificationStatus: 'PENDING' },
        data: { notificationStatus: 'PENDING' },
      });
      this.logger.warn(`Could not enqueue prize draw notification for spin ${spinId}: ${String(error)}`);
    }
  }

  async enqueuePresentation(spinId: string, options: { delayMs: number }): Promise<void> {
    try {
      await this.queue.add(
        PRIZE_DRAW_PRESENTATION_JOB,
        { spinId },
        {
          jobId: buildBullMqJobId('prize-draw-presentation', spinId),
          delay: Math.max(0, options.delayMs),
          attempts: 8,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    } catch (error) {
      this.logger.warn(`Could not enqueue prize draw publication for spin ${spinId}: ${String(error)}`);
    }
  }

  async releasePresentation(spinId: string): Promise<boolean> {
    const acknowledged = await this.prisma.prizeDrawSpin.updateMany({
      where: { id: spinId, undoneAt: null, presentationAcknowledgedAt: null },
      data: { presentationAcknowledgedAt: new Date() },
    });
    const spin = await this.prisma.prizeDrawSpin.findUnique({
      where: { id: spinId },
      select: {
        drawId: true,
        undoneAt: true,
        presentationAcknowledgedAt: true,
        notificationStatus: true,
        notificationTransactionId: true,
        draw: { select: { revision: true } },
      },
    });
    if (!spin || spin.undoneAt || !spin.presentationAcknowledgedAt) return false;
    if (acknowledged.count === 1) {
      if (spin.notificationStatus === 'PENDING' && spin.notificationTransactionId) {
        await this.enqueueWinner(spinId, { delayMs: 0 });
      }
    }
    await this.realtime.publishDraw(spin.drawId, 'SPIN_PRESENTED', spin.draw.revision, spinId);
    return true;
  }

  async deliverWinner(spinId: string): Promise<void> {
    const reference = await this.prisma.prizeDrawSpin.findUnique({ where: { id: spinId }, select: { drawId: true } });
    if (!reference) return;
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${reference.drawId}))`;
        const spin = await this.notificationRecord(spinId, tx);
        if (
          !spin ||
          spin.undoneAt ||
          !spin.presentationAcknowledgedAt ||
          !spin.notificationTransactionId ||
          !spin.winnerPerson
        ) {
          if (spin?.undoneAt) {
            await tx.prizeDrawSpin.updateMany({
              where: { id: spinId, notificationStatus: 'PENDING' },
              data: { notificationStatus: 'CANCELLED' },
            });
          }
          return;
        }
        const delivered = await this.notifications.notifyPrizeDrawWinner({
          ...this.notificationInput(spin),
          transactionId: spin.notificationTransactionId,
        });
        if (!delivered) throw new Error(`Novu did not acknowledge prize draw winner notification for spin ${spinId}.`);
        await tx.prizeDrawSpin.update({
          where: { id: spinId },
          data: { notificationStatus: 'SENT' },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async undoSpin(spinId: string): Promise<void> {
    await this.removePendingWinnerJob(spinId);
    const spin = await this.notificationRecord(spinId);
    if (!spin || !spin.notificationTransactionId || !spin.winnerPerson) return;

    const cancelled = await this.notifications.cancelTriggeredNotification(spin.notificationTransactionId);
    const deleted = await this.notifications.deleteNotificationMessages(spin.notificationTransactionId);
    const shouldNotifyUndo = spin.notificationStatus === 'SENT';
    const undoTransactionId = shouldNotifyUndo ? `prize-draw-undone:${spin.drawId}:${spin.sequence}` : null;
    const delivered = undoTransactionId
      ? await this.notifications.notifyPrizeDrawUndone({
          ...this.notificationInput(spin),
          transactionId: undoTransactionId,
        })
      : false;
    await this.prisma.prizeDrawSpin.update({
      where: { id: spinId },
      data: {
        notificationStatus: cancelled && deleted ? 'CANCELLED' : 'FAILED',
        undoNotificationTransactionId: undoTransactionId,
        undoNotificationStatus: undoTransactionId ? (delivered ? 'SENT' : 'FAILED') : 'NOT_REQUESTED',
      },
    });
    await this.enqueueCleanup(spinId, delivered || !undoTransactionId ? UNDO_NOTIFICATION_RETENTION_MS : 5_000);
  }

  private async enqueueCleanup(spinId: string, delayMs: number): Promise<void> {
    await this.queue.add(
      PRIZE_DRAW_NOTIFICATION_CLEANUP_JOB,
      { spinId },
      {
        jobId: buildBullMqJobId('prize-draw-cleanup', spinId),
        delay: Math.max(0, delayMs),
        attempts: 8,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  async cleanup(spinId: string): Promise<void> {
    const spin = await this.prisma.prizeDrawSpin.findUnique({
      where: { id: spinId },
      select: { notificationTransactionId: true, undoNotificationTransactionId: true },
    });
    if (!spin) return;
    const transactionIds = [spin.notificationTransactionId, spin.undoNotificationTransactionId].filter(
      (value): value is string => Boolean(value),
    );
    const results = await Promise.all(transactionIds.map((id) => this.notifications.deleteNotificationMessages(id)));
    if (results.every(Boolean)) {
      await this.prisma.prizeDrawSpin.update({
        where: { id: spinId },
        data: { notificationStatus: 'DELETED', undoNotificationStatus: 'DELETED' },
      });
      return;
    }
    throw new Error(`Could not delete every Novu message for undone spin ${spinId}.`);
  }

  async reconcilePending(): Promise<void> {
    const [unpublished, pending, undone] = await Promise.all([
      this.prisma.prizeDrawSpin.findMany({
        where: {
          presentationAcknowledgedAt: null,
          undoneAt: null,
          drawnAt: { gte: new Date(Date.now() - PRIZE_DRAW_PRESENTATION_RECONCILIATION_WINDOW_MS) },
        },
        select: { id: true, drawnAt: true, countdownSeconds: true, reelDurationMs: true, preRevealPauseMs: true },
        orderBy: { drawnAt: 'asc' },
        take: 100,
      }),
      this.prisma.prizeDrawSpin.findMany({
        where: {
          notificationStatus: 'PENDING',
          notificationTransactionId: { not: null },
          presentationAcknowledgedAt: { not: null },
          undoneAt: null,
        },
        select: { id: true },
        orderBy: { presentationAcknowledgedAt: 'asc' },
        take: 100,
      }),
      this.prisma.prizeDrawSpin.findMany({
        where: {
          undoneAt: { not: null },
          OR: [
            { notificationTransactionId: { not: null }, notificationStatus: { not: 'DELETED' } },
            { undoNotificationTransactionId: { not: null }, undoNotificationStatus: { not: 'DELETED' } },
          ],
        },
        select: { id: true },
        orderBy: { undoneAt: 'asc' },
        take: 100,
      }),
    ]);
    await Promise.all([
      ...unpublished.map((spin) => {
        const releaseAt =
          spin.drawnAt.getTime() +
          (spin.countdownSeconds ?? 0) * 1000 +
          spin.reelDurationMs +
          spin.preRevealPauseMs +
          PRIZE_DRAW_PRESENTATION_GRACE_MS;
        return this.enqueuePresentation(spin.id, { delayMs: Math.max(0, releaseAt - Date.now()) });
      }),
      ...pending.map((spin) => this.enqueueWinner(spin.id, { delayMs: 0 })),
      ...undone.map((spin) => this.enqueueCleanup(spin.id, 0)),
    ]);
  }

  private async removePendingWinnerJob(spinId: string): Promise<void> {
    const queue = this.queue as Queue<PrizeDrawNotificationJob> & {
      getJob?: (jobId: string) => Promise<{ remove(): Promise<void> } | undefined>;
    };
    if (typeof queue.getJob !== 'function') return;
    try {
      await (await queue.getJob(this.winnerJobId(spinId)))?.remove();
    } catch {
      // An active job cannot be removed; the undoneAt check in deliverWinner is the final guard.
    }
  }

  private winnerJobId(spinId: string): string {
    return buildBullMqJobId('prize-draw-winner', spinId);
  }

  private notificationRecord(spinId: string, client: Prisma.TransactionClient | PrismaService = this.prisma) {
    return client.prizeDrawSpin.findUnique({
      where: { id: spinId },
      select: {
        id: true,
        drawId: true,
        sequence: true,
        description: true,
        undoneAt: true,
        presentationAcknowledgedAt: true,
        notificationTransactionId: true,
        notificationStatus: true,
        winnerPerson: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            userId: true,
            user: { select: { id: true, email: true, name: true } },
            mergedInto: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                userId: true,
                user: { select: { id: true, email: true, name: true } },
              },
            },
          },
        },
        draw: {
          select: {
            title: true,
            targetType: true,
            eventId: true,
            majorEventId: true,
          },
        },
      },
    });
  }

  private notificationInput(
    spin: NonNullable<Awaited<ReturnType<PrizeDrawNotificationJobsService['notificationRecord']>>>,
  ) {
    const targetId = spin.draw.eventId ?? spin.draw.majorEventId;
    const winnerPerson = spin.winnerPerson;
    if (!targetId || !winnerPerson) throw new Error(`Incomplete notification target for prize draw spin ${spin.id}.`);
    const recipientPerson = winnerPerson.mergedInto ?? winnerPerson;
    return {
      drawId: spin.drawId,
      spinId: spin.id,
      drawTitle: spin.draw.title,
      spinDescription: spin.description,
      targetType: spin.draw.targetType,
      targetId,
      recipient: this.notifications.mapPersonToRecipient(recipientPerson),
    };
  }
}
