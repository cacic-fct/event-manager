import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MajorEventSubscriptionFlow, Prisma, ReceiptValidationActionType, SubscriptionStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { CurrentUserMajorEventSubscriptionService } from '../../current-user/major-events/subscription.service';
import { DashboardInsightsService } from '../../dashboard/insights.service';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminReceiptQueueItem, AdminReceiptValidationResult, ReceiptRejectionCode } from '../receipt.types';
import {
  countReceiptEventsByCategory,
  getActorId,
  getScheduleConflictEventIds,
  normalizeRejectionReason,
  normalizeRequestedEventIds,
  rejectionStatus,
} from '../utils/receipt-validation.utils';
import { ReceiptAdminQueueService } from './receipt-admin-queue.service';
import { ReceiptSubscriptionSyncService } from './receipt-subscription-sync.service';

type ActionableReceiptSubscription = Prisma.MajorEventSubscriptionGetPayload<{
  include: {
    selectedEvents: {
      select: {
        eventId: true;
        preferenceOrder: true;
        event: {
          select: {
            id: true;
            type: true;
            eventGroupId: true;
            startDate: true;
            endDate: true;
            slots: true;
            autoSubscribe: true;
          };
        };
      };
    };
    receipts: {
      select: {
        id: true;
      };
    };
  };
}>;

@Injectable()
export class ReceiptValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceCategories: AttendanceCategoryService,
    private readonly majorEventSubscriptions: CurrentUserMajorEventSubscriptionService,
    private readonly dashboardInsights: DashboardInsightsService,
    private readonly queue: ReceiptAdminQueueService,
    private readonly sync: ReceiptSubscriptionSyncService,
  ) {}

  async approveReceipt(
    subscriptionId: string,
    receiptId: string,
    selectedEventIds: string[] | undefined,
    authenticatedUser: AuthenticatedUser,
  ): Promise<AdminReceiptValidationResult> {
    const actorId = getActorId(authenticatedUser);
    const result = await this.prisma.$transaction(async (tx) => {
      const subscription = await this.findActionableSubscription(tx, subscriptionId, receiptId);
      const eventIdsToConfirm = await this.resolveAdminSelectedEventIds(tx, subscription, selectedEventIds);
      const now = new Date();

      const action = await tx.majorEventReceiptValidationAction.create({
        data: {
          subscriptionId,
          receiptId,
          action: ReceiptValidationActionType.APPROVE,
          previousStatus: subscription.subscriptionStatus,
          nextStatus: SubscriptionStatus.CONFIRMED,
          previousRejectionReason: subscription.receiptRejectionReason,
          createdById: actorId,
        },
      });

      await tx.majorEventSubscription.update({
        where: {
          id: subscriptionId,
        },
        data: {
          subscriptionStatus: SubscriptionStatus.CONFIRMED,
          receiptRejectionReason: null,
          receiptValidatedAt: now,
          receiptValidatedBy: actorId,
        },
      });

      await this.sync.syncConfirmedEventSubscriptions(
        tx,
        subscription.majorEventId,
        subscription.personId,
        eventIdsToConfirm,
        SubscriptionStatus.CONFIRMED,
        actorId,
      );
      await this.attendanceCategories.refreshForMajorEventPerson(subscription.majorEventId, subscription.personId, tx);
      await this.sync.refreshEventSubscriptionCounters(tx, [
        ...subscription.selectedEvents.map((selection) => selection.eventId),
        ...eventIdsToConfirm,
      ]);

      return action;
    });

    const item = await this.queue.getSubscriptionQueueItem(subscriptionId);
    if (!item) {
      throw new NotFoundException(`Subscription ${subscriptionId} was not found after receipt approval ${result.id}.`);
    }
    await this.queue.notifySubscriptionChanged(SubscriptionStatus.RECEIPT_UNDER_REVIEW, subscriptionId);
    await this.dashboardInsights.invalidateCachedInsights();
    return {
      actionId: result.id,
      item,
    };
  }

  async rejectReceipt(
    subscriptionId: string,
    receiptId: string | undefined,
    rejectionCode: ReceiptRejectionCode,
    reason: string | undefined,
    authenticatedUser: AuthenticatedUser,
  ): Promise<AdminReceiptValidationResult> {
    const actorId = getActorId(authenticatedUser);
    const nextStatus = rejectionStatus(rejectionCode);
    const normalizedReason = normalizeRejectionReason(reason);

    if (nextStatus === SubscriptionStatus.REJECTED_INVALID_RECEIPT && !normalizedReason) {
      throw new BadRequestException('A rejection reason is required for invalid receipts.');
    }

    const action = await this.prisma.$transaction(async (tx) => {
      const subscription = await this.findActionableSubscription(tx, subscriptionId, receiptId);
      const now = new Date();

      const createdAction = await tx.majorEventReceiptValidationAction.create({
        data: {
          subscriptionId,
          receiptId: receiptId ?? null,
          action: ReceiptValidationActionType.REJECT,
          previousStatus: subscription.subscriptionStatus,
          nextStatus,
          previousRejectionReason: subscription.receiptRejectionReason,
          nextRejectionReason: normalizedReason,
          createdById: actorId,
        },
      });

      await tx.majorEventSubscription.update({
        where: {
          id: subscriptionId,
        },
        data: {
          subscriptionStatus: nextStatus,
          receiptRejectionReason: normalizedReason,
          receiptValidatedAt: now,
          receiptValidatedBy: actorId,
        },
      });

      await this.attendanceCategories.refreshForMajorEventPerson(subscription.majorEventId, subscription.personId, tx);
      return createdAction;
    });

    const item = await this.queue.getSubscriptionQueueItem(subscriptionId);
    if (!item) {
      throw new NotFoundException(`Subscription ${subscriptionId} was not found after receipt rejection.`);
    }
    await this.queue.notifySubscriptionChanged(SubscriptionStatus.RECEIPT_UNDER_REVIEW, subscriptionId);
    await this.dashboardInsights.invalidateCachedInsights();
    return {
      actionId: action.id,
      item,
    };
  }

  async undoValidationAction(actionId: string, authenticatedUser: AuthenticatedUser): Promise<AdminReceiptQueueItem> {
    const actorId = getActorId(authenticatedUser);

    const action = await this.prisma.$transaction(async (tx) => {
      const existingAction = await tx.majorEventReceiptValidationAction.findUnique({
        where: {
          id: actionId,
        },
        include: {
          subscription: {
            include: {
              selectedEvents: {
                where: {
                  deletedAt: null,
                },
                select: {
                  eventId: true,
                },
              },
              receipts: {
                orderBy: {
                  uploadedAt: 'desc',
                },
                take: 1,
                select: {
                  id: true,
                },
              },
            },
          },
        },
      });

      if (!existingAction || existingAction.undoneAt) {
        throw new NotFoundException(`Validation action ${actionId} was not found.`);
      }

      const latestReceipt = existingAction.subscription.receipts[0];
      if (
        existingAction.subscription.subscriptionStatus !== existingAction.nextStatus ||
        (existingAction.receiptId ? latestReceipt?.id !== existingAction.receiptId : false)
      ) {
        throw new ConflictException('This validation action can no longer be undone because the subscription changed.');
      }

      const selectedEventIds = existingAction.subscription.selectedEvents.map((selection) => selection.eventId);
      const now = new Date();

      await tx.majorEventSubscription.update({
        where: {
          id: existingAction.subscriptionId,
        },
        data: {
          subscriptionStatus: existingAction.previousStatus,
          receiptRejectionReason: existingAction.previousRejectionReason,
          receiptValidatedAt: null,
          receiptValidatedBy: null,
        },
      });

      await tx.majorEventReceiptValidationAction.update({
        where: {
          id: actionId,
        },
        data: {
          undoneAt: now,
          undoneById: actorId,
        },
      });

      await this.sync.syncConfirmedEventSubscriptions(
        tx,
        existingAction.subscription.majorEventId,
        existingAction.subscription.personId,
        selectedEventIds,
        existingAction.previousStatus,
        actorId,
      );
      await this.attendanceCategories.refreshForMajorEventPerson(
        existingAction.subscription.majorEventId,
        existingAction.subscription.personId,
        tx,
      );
      await this.sync.refreshEventSubscriptionCounters(tx, selectedEventIds);

      return existingAction;
    });

    const item = await this.queue.getSubscriptionQueueItem(action.subscriptionId);
    if (!item) {
      throw new NotFoundException(`Subscription ${action.subscriptionId} was not found after undo.`);
    }
    await this.queue.notifySubscriptionChanged(action.nextStatus, action.subscriptionId);
    await this.dashboardInsights.invalidateCachedInsights();
    return item;
  }

  private async resolveAdminSelectedEventIds(
    tx: Prisma.TransactionClient,
    subscription: ActionableReceiptSubscription,
    requestedEventIds: string[] | undefined,
  ): Promise<string[]> {
    const storedEventIds = subscription.selectedEvents.map((selection) => selection.eventId);
    if (subscription.subscriptionFlow !== MajorEventSubscriptionFlow.RANKED_VOTING) {
      return requestedEventIds?.length ? normalizeRequestedEventIds(requestedEventIds, storedEventIds) : storedEventIds;
    }

    const rankedEvents = await this.buildRankedEventsWithAvailability(tx, subscription);
    const desiredCounts = {
      desiredCourses: subscription.desiredCourses ?? 0,
      desiredLectures: subscription.desiredLectures ?? 0,
      desiredUncategorized: subscription.desiredUncategorized ?? 0,
    };
    const recommendedEventIds = this.majorEventSubscriptions.allocateRankedEventIds(rankedEvents, desiredCounts);
    if (!requestedEventIds?.length) {
      return recommendedEventIds;
    }

    const normalizedRequestedEventIds = normalizeRequestedEventIds(requestedEventIds, storedEventIds);
    const requestedEventIdSet = new Set(normalizedRequestedEventIds);
    const autoEventIds = new Set(
      subscription.selectedEvents
        .filter((selection) => selection.event.autoSubscribe)
        .map((selection) => selection.eventId),
    );
    for (const autoEventId of autoEventIds) {
      if (!requestedEventIdSet.has(autoEventId)) {
        throw new BadRequestException(`Automatic event ${autoEventId} must be confirmed.`);
      }
    }

    const eventsById = new Map(rankedEvents.map((event) => [event.id, event]));
    const requestedEvents = normalizedRequestedEventIds.map((eventId) => eventsById.get(eventId)).filter((event): event is (typeof rankedEvents)[number] => Boolean(event));
    if (!requestedEvents.every((event) => event.slots == null || event.slotsAvailable == null || event.slotsAvailable > 0)) {
      throw new BadRequestException('Cannot approve ranked selections with events that have no available slots.');
    }
    if (getScheduleConflictEventIds(requestedEvents).size > 0) {
      throw new BadRequestException('Cannot approve ranked selections with schedule conflicts.');
    }

    const requestedCounts = countReceiptEventsByCategory(requestedEvents);
    const recommendedCounts = countReceiptEventsByCategory(
      recommendedEventIds.map((eventId) => eventsById.get(eventId)).filter((event): event is (typeof rankedEvents)[number] => Boolean(event)),
    );
    if (
      requestedCounts.course !== recommendedCounts.course ||
      requestedCounts.lecture !== recommendedCounts.lecture ||
      requestedCounts.uncategorized !== recommendedCounts.uncategorized
    ) {
      throw new BadRequestException('Selected ranked events must match the number of currently allocatable requested events.');
    }

    return normalizedRequestedEventIds;
  }

  private async buildRankedEventsWithAvailability(
    tx: Prisma.TransactionClient,
    subscription: ActionableReceiptSubscription,
  ) {
    const activeCounts = await Promise.all(
      subscription.selectedEvents.map(async (selection) => ({
        eventId: selection.eventId,
        count: await tx.eventSubscription.count({
          where: {
            eventId: selection.eventId,
            deletedAt: null,
            personId: {
              not: subscription.personId,
            },
          },
        }),
      })),
    );
    const activeCountByEventId = new Map(activeCounts.map((item) => [item.eventId, item.count]));
    return subscription.selectedEvents.map((selection) => ({
      id: selection.event.id,
      type: selection.event.type,
      eventGroupId: selection.event.eventGroupId,
      startDate: selection.event.startDate,
      endDate: selection.event.endDate,
      slots: selection.event.slots,
      slotsAvailable:
        selection.event.slots == null
          ? null
          : Math.max(selection.event.slots - (activeCountByEventId.get(selection.eventId) ?? 0), 0),
      autoSubscribe: selection.event.autoSubscribe,
    }));
  }

  private async findActionableSubscription(
    tx: Prisma.TransactionClient,
    subscriptionId: string,
    receiptId: string | undefined,
  ): Promise<ActionableReceiptSubscription> {
    const subscription = await tx.majorEventSubscription.findUnique({
      where: {
        id: subscriptionId,
      },
      include: {
        selectedEvents: {
          where: {
            deletedAt: null,
          },
          select: {
            eventId: true,
            preferenceOrder: true,
            event: {
              select: {
                id: true,
                type: true,
                eventGroupId: true,
                startDate: true,
                endDate: true,
                slots: true,
                autoSubscribe: true,
              },
            },
          },
          orderBy: [
            {
              preferenceOrder: 'asc',
            },
            {
              event: {
                startDate: 'asc',
              },
            },
          ],
        },
        receipts: {
          orderBy: {
            uploadedAt: 'desc',
          },
          take: 1,
          select: {
            id: true,
          },
        },
      },
    });

    if (!subscription || subscription.deletedAt) {
      throw new NotFoundException(`Subscription ${subscriptionId} was not found.`);
    }

    if (subscription.subscriptionStatus !== SubscriptionStatus.RECEIPT_UNDER_REVIEW) {
      throw new ConflictException('This receipt has already been validated.');
    }

    if (receiptId && subscription.receipts[0]?.id !== receiptId) {
      throw new ConflictException('A newer receipt has been uploaded for this subscription.');
    }

    return subscription;
  }
}
