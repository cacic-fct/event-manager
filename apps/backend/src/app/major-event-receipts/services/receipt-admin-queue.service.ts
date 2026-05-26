import { Injectable } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import {
  MajorEventSubscriptionNotificationRecord,
  NovuNotificationsService,
} from '../../notifications/novu-notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReceiptQueueMapper } from '../mappers/receipt-queue.mapper';
import { AdminReceiptQueueItem, AdminReceiptQueueResponse } from '../receipt.types';

@Injectable()
export class ReceiptAdminQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: ReceiptQueueMapper,
    private readonly notifications: NovuNotificationsService,
  ) {}

  async getPendingValidationCount(): Promise<{ pendingCount: number }> {
    const pendingCount = await this.prisma.majorEventSubscription.count({
      where: {
        deletedAt: null,
        subscriptionStatus: SubscriptionStatus.RECEIPT_UNDER_REVIEW,
        majorEvent: {
          deletedAt: null,
          isPaymentRequired: true,
        },
      },
    });

    return { pendingCount };
  }

  async listPendingValidationQueue(majorEventId?: string): Promise<AdminReceiptQueueResponse> {
    const where = {
      deletedAt: null,
      subscriptionStatus: SubscriptionStatus.RECEIPT_UNDER_REVIEW,
      ...(majorEventId ? { majorEventId } : {}),
      majorEvent: {
        deletedAt: null,
        isPaymentRequired: true,
      },
    } satisfies Prisma.MajorEventSubscriptionWhereInput;

    const [pendingCount, subscriptions] = await Promise.all([
      this.prisma.majorEventSubscription.count({ where }),
      this.prisma.majorEventSubscription.findMany({
        where,
        select: this.mapper.adminQueueSubscriptionSelect(),
        orderBy: [
          {
            updatedAt: 'asc',
          },
          {
            createdAt: 'asc',
          },
        ],
        take: 100,
      }),
    ]);

    return {
      pendingCount,
      items: subscriptions.map((subscription) => this.mapper.mapAdminQueueItem(subscription)),
    };
  }

  async getSubscriptionQueueItem(subscriptionId: string): Promise<AdminReceiptQueueItem | null> {
    const subscription = await this.prisma.majorEventSubscription.findUnique({
      where: {
        id: subscriptionId,
      },
      select: this.mapper.adminQueueSubscriptionSelect(),
    });

    return subscription ? this.mapper.mapAdminQueueItem(subscription) : null;
  }

  async findMajorEventSubscriptionNotificationRecord(
    id: string,
  ): Promise<MajorEventSubscriptionNotificationRecord | null> {
    return this.prisma.majorEventSubscription.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        majorEventId: true,
        subscriptionStatus: true,
        receiptRejectionReason: true,
        majorEvent: {
          select: {
            name: true,
          },
        },
        person: {
          select: {
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
          },
        },
      },
    });
  }

  async notifySubscriptionChanged(previousStatus: SubscriptionStatus, subscriptionId: string): Promise<void> {
    const notificationRecord = await this.findMajorEventSubscriptionNotificationRecord(subscriptionId);
    if (notificationRecord) {
      await this.notifications.notifyMajorEventSubscriptionRecordChanged(previousStatus, notificationRecord);
    }
  }
}
