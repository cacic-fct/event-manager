import { Injectable } from '@nestjs/common';
import { MajorEventReceipt, MajorEventSubscriptionFlow, Prisma } from '@prisma/client';
import { CurrentUserMajorEventSubscriptionService } from '../../current-user/major-events/subscription.service';
import { AdminReceiptQueueItem, CurrentUserReceiptResponse } from '../receipt.types';
import { getScheduleConflictEventIds } from '../utils/receipt-validation.utils';

@Injectable()
export class ReceiptQueueMapper {
  constructor(private readonly majorEventSubscriptions: CurrentUserMajorEventSubscriptionService) {}

  adminQueueSubscriptionSelect() {
    return {
      id: true,
      majorEventId: true,
      majorEvent: {
        select: {
          name: true,
          createdAt: true,
          endDate: true,
        },
      },
      personId: true,
      person: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      amountPaid: true,
      paymentTier: true,
      subscriptionFlow: true,
      desiredCourses: true,
      desiredLectures: true,
      desiredUncategorized: true,
      subscriptionStatus: true,
      receiptRejectionReason: true,
      updatedAt: true,
      selectedEvents: {
        where: {
          deletedAt: null,
        },
        select: {
          preferenceOrder: true,
          event: {
            select: {
              id: true,
              name: true,
              emoji: true,
              type: true,
              eventGroupId: true,
              eventGroup: {
                select: {
                  name: true,
                },
              },
              startDate: true,
              endDate: true,
              locationDescription: true,
              slots: true,
              slotsAvailable: true,
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
      },
    } satisfies Prisma.MajorEventSubscriptionSelect;
  }

  mapAdminQueueItem(
    subscription: Prisma.MajorEventSubscriptionGetPayload<{
      select: ReturnType<ReceiptQueueMapper['adminQueueSubscriptionSelect']>;
    }>,
  ): AdminReceiptQueueItem {
    const events = subscription.selectedEvents.map((selection) => selection.event);
    const conflictIds = getScheduleConflictEventIds(events);
    const recommendedEventIds =
      subscription.subscriptionFlow === MajorEventSubscriptionFlow.RANKED_VOTING
        ? new Set(
            this.majorEventSubscriptions.allocateRankedEventIds(
              subscription.selectedEvents.map((selection) => ({
                id: selection.event.id,
                type: selection.event.type,
                eventGroupId: selection.event.eventGroupId,
                startDate: selection.event.startDate,
                endDate: selection.event.endDate,
                slots: selection.event.slots,
                slotsAvailable: selection.event.slotsAvailable,
                autoSubscribe: selection.event.autoSubscribe,
              })),
              {
                desiredCourses: subscription.desiredCourses ?? 0,
                desiredLectures: subscription.desiredLectures ?? 0,
                desiredUncategorized: subscription.desiredUncategorized ?? 0,
              },
            ),
          )
        : new Set(events.map((event) => event.id));
    const latestReceipt = subscription.receipts[0];
    const hasOcrMatch =
      latestReceipt?.amountMatched === true ||
      latestReceipt?.nameMatched === true ||
      Boolean(latestReceipt?.matchedAmountText) ||
      Boolean(latestReceipt?.matchedNameText);

    return {
      subscriptionId: subscription.id,
      majorEventId: subscription.majorEventId,
      majorEventName: subscription.majorEvent.name,
      majorEventCreatedAt: subscription.majorEvent.createdAt,
      majorEventEndDate: subscription.majorEvent.endDate,
      personId: subscription.personId,
      personName: subscription.person.name,
      personEmail: subscription.person.email,
      personPhone: subscription.person.phone,
      amountPaid: subscription.amountPaid,
      paymentTier: subscription.paymentTier,
      subscriptionFlow: subscription.subscriptionFlow,
      desiredCourses: subscription.desiredCourses,
      desiredLectures: subscription.desiredLectures,
      desiredUncategorized: subscription.desiredUncategorized,
      subscriptionStatus: subscription.subscriptionStatus,
      subscriptionUpdatedAt: subscription.updatedAt,
      receiptRejectionReason: subscription.receiptRejectionReason,
      receipt: latestReceipt
        ? {
            id: latestReceipt.id,
            fileName: latestReceipt.fileName,
            mimeType: latestReceipt.mimeType,
            sizeBytes: latestReceipt.sizeBytes,
            uploadedAt: latestReceipt.uploadedAt,
            expiresAt: latestReceipt.expiresAt,
            imageUrl: `/api/major-event-receipts/${latestReceipt.id}/image`,
            processingStatus: latestReceipt.processingStatus,
            ocrText: latestReceipt.ocrText,
            amountMatched: hasOcrMatch ? latestReceipt.amountMatched : null,
            matchedAmountText: hasOcrMatch ? latestReceipt.matchedAmountText : null,
            nameMatched: hasOcrMatch ? latestReceipt.nameMatched : null,
            matchedNameText: hasOcrMatch ? latestReceipt.matchedNameText : null,
          }
        : null,
      events: subscription.selectedEvents.map((selection) => ({
        id: selection.event.id,
        name: selection.event.name,
        emoji: selection.event.emoji,
        type: selection.event.type,
        eventGroupId: selection.event.eventGroupId,
        eventGroupName: selection.event.eventGroup?.name,
        preferenceOrder: selection.preferenceOrder,
        startDate: selection.event.startDate,
        endDate: selection.event.endDate,
        locationDescription: selection.event.locationDescription,
        slots: selection.event.slots,
        slotsAvailable: selection.event.slotsAvailable,
        autoSubscribe: selection.event.autoSubscribe,
        selectedForConfirmation: recommendedEventIds.has(selection.event.id),
        hasScheduleConflict: conflictIds.has(selection.event.id),
        hasNoSlots: selection.event.slotsAvailable != null && selection.event.slotsAvailable <= 0,
      })),
    };
  }
}

export function mapReceipt(receipt: MajorEventReceipt): CurrentUserReceiptResponse {
  return {
    id: receipt.id,
    fileName: receipt.fileName,
    mimeType: receipt.mimeType,
    sizeBytes: receipt.sizeBytes,
    uploadedAt: receipt.uploadedAt,
    expiresAt: receipt.expiresAt,
    imageUrl: `/api/major-event-receipts/${receipt.id}/image`,
    processingStatus: receipt.processingStatus,
    amountMatched: receipt.amountMatched,
    nameMatched: receipt.nameMatched,
  };
}
