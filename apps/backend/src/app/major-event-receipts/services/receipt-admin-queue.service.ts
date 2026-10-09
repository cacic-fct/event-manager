import { Injectable, Optional } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import {
  MajorEventSubscriptionNotificationRecord,
  NovuNotificationsService,
} from '../../notifications/novu-notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReceiptQueueMapper } from '../mappers/receipt-queue.mapper';
import { AdminReceiptQueueItem, AdminReceiptQueueResponse } from '../receipt.types';
import { TicketPurchasesService } from '../../ticket-purchases/ticket-purchases.service';

const QUEUE_LIMIT = 100;

@Injectable()
export class ReceiptAdminQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: ReceiptQueueMapper,
    private readonly notifications: NovuNotificationsService,
    @Optional() private readonly ticketPurchases?: TicketPurchasesService,
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

    const ticketCount = this.ticketPurchases ? await this.prisma.ticketPurchase.count({
      where: this.ticketPurchases.pendingWhere(),
    }) : 0;
    return { pendingCount: pendingCount + ticketCount };
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
            id: 'asc',
          },
        ],
        take: QUEUE_LIMIT,
      }),
    ]);

    const [ticketItems, ticketCount] = this.ticketPurchases
      ? await Promise.all([
          this.ticketPurchases.pending(majorEventId, QUEUE_LIMIT),
          this.prisma.ticketPurchase.count({ where: this.ticketPurchases.pendingWhere(majorEventId) }),
        ])
      : [[], 0];
    const availablePaymentTiers = majorEventId && this.ticketPurchases
      ? await this.prisma.priceTier.findMany({ where: { price: { majorEventId } }, select: { id: true, name: true }, orderBy: { value: 'asc' } })
      : [];
    const items = [...subscriptions.map((subscription) => this.mapper.mapAdminQueueItem(subscription)), ...ticketItems]
      .sort((a, b) => a.subscriptionUpdatedAt.getTime() - b.subscriptionUpdatedAt.getTime() || a.subscriptionId.localeCompare(b.subscriptionId))
      .slice(0, QUEUE_LIMIT);
    return {
      pendingCount: pendingCount + ticketCount,
      subscriptionCount: pendingCount,
      ticketCount,
      availablePaymentTiers,
      items,
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
