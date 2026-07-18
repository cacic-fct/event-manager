import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PublicationState, SubscriptionStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NovuNotificationsService } from '../notifications/novu-notifications.service';

export const ONLINE_ATTENDANCE_NOTIFICATION_QUEUE = 'online-attendance-notifications';
export const ONLINE_ATTENDANCE_AVAILABLE_NOTIFICATION_JOB = 'notify-online-attendance-available';

export interface OnlineAttendanceAvailableNotificationJob {
  eventId: string;
  onlineAttendanceStartDate: string;
}

const PERSON_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  userId: true,
  user: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
} as const;

@Injectable()
export class OnlineAttendanceNotificationJobsService {
  private readonly logger = new Logger(OnlineAttendanceNotificationJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NovuNotificationsService,
    @InjectQueue(ONLINE_ATTENDANCE_NOTIFICATION_QUEUE)
    private readonly queue: Queue<OnlineAttendanceAvailableNotificationJob>,
  ) {}

  async scheduleEvent(event: {
    id: string;
    endDate: Date;
    shouldCollectAttendance: boolean;
    isOnlineAttendanceAllowed: boolean;
    onlineAttendanceCode: string | null;
    onlineAttendanceStartDate: Date | null;
    onlineAttendanceEndDate: Date | null;
  }): Promise<void> {
    const startDate = event.onlineAttendanceStartDate;
    const endDate = event.onlineAttendanceEndDate;
    if (
      !event.shouldCollectAttendance ||
      !event.isOnlineAttendanceAllowed ||
      !event.onlineAttendanceCode?.trim() ||
      !startDate ||
      !endDate ||
      startDate >= endDate ||
      startDate > event.endDate ||
      endDate <= new Date()
    ) {
      return;
    }

    try {
      await this.queue.add(
        ONLINE_ATTENDANCE_AVAILABLE_NOTIFICATION_JOB,
        {
          eventId: event.id,
          onlineAttendanceStartDate: startDate.toISOString(),
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          delay: Math.max(startDate.getTime() - Date.now(), 0),
          jobId: `online-attendance-available:${event.id}:${startDate.getTime()}`,
          removeOnComplete: false,
          removeOnFail: true,
        },
      );
    } catch (error) {
      this.logger.error(
        `Could not schedule the online attendance notification for event ${event.id}.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async schedulePendingEvents(): Promise<void> {
    const events = await this.prisma.event.findMany({
      where: {
        deletedAt: null,
        shouldCollectAttendance: true,
        isOnlineAttendanceAllowed: true,
        onlineAttendanceCode: { not: null },
        onlineAttendanceStartDate: { not: null },
        onlineAttendanceEndDate: { gte: new Date() },
      },
      select: {
        id: true,
        endDate: true,
        shouldCollectAttendance: true,
        isOnlineAttendanceAllowed: true,
        onlineAttendanceCode: true,
        onlineAttendanceStartDate: true,
        onlineAttendanceEndDate: true,
      },
    });

    await Promise.all(events.map((event) => this.scheduleEvent(event)));
  }

  async deliver(input: OnlineAttendanceAvailableNotificationJob): Promise<void> {
    const startDate = new Date(input.onlineAttendanceStartDate);
    const now = new Date();
    const event = await this.prisma.event.findFirst({
      where: {
        id: input.eventId,
        deletedAt: null,
        endDate: { gte: now },
        publiclyVisible: true,
        publicationState: PublicationState.PUBLISHED,
        shouldCollectAttendance: true,
        isOnlineAttendanceAllowed: true,
        onlineAttendanceCode: { not: null },
        onlineAttendanceStartDate: startDate,
        onlineAttendanceEndDate: { gte: now },
      },
      select: {
        id: true,
        name: true,
        endDate: true,
        onlineAttendanceStartDate: true,
        onlineAttendanceCode: true,
        onlineAttendanceEndDate: true,
        subscriptions: {
          where: { deletedAt: null },
          select: { person: { select: PERSON_SELECT } },
        },
        majorEvent: {
          select: {
            subscriptions: {
              where: {
                deletedAt: null,
                subscriptionStatus: SubscriptionStatus.CONFIRMED,
              },
              select: { person: { select: PERSON_SELECT } },
            },
          },
        },
      },
    });

    if (
      !event?.onlineAttendanceCode?.trim() ||
      !event.onlineAttendanceStartDate ||
      !event.onlineAttendanceEndDate ||
      event.onlineAttendanceStartDate > event.endDate
    ) {
      return;
    }

    const recipients = [
      ...event.subscriptions.map(({ person }) => this.notifications.mapPersonToRecipient(person)),
      ...(event.majorEvent?.subscriptions ?? []).map(({ person }) => this.notifications.mapPersonToRecipient(person)),
    ];
    const uniqueRecipients = [...new Map(recipients.map((recipient) => [recipient.subscriberId, recipient])).values()];
    const delivered = await this.notifications.notifyOnlineAttendanceAvailable({
      eventId: event.id,
      eventName: event.name,
      endsAt: event.onlineAttendanceEndDate,
      recipients: uniqueRecipients,
    });
    if (!delivered) {
      throw new Error(`Online attendance notification for event ${event.id} was not acknowledged.`);
    }
  }
}
