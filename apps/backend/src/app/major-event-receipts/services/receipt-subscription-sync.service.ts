import { Injectable } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';

@Injectable()
export class ReceiptSubscriptionSyncService {
  async syncConfirmedEventSubscriptions(
    tx: Prisma.TransactionClient,
    majorEventId: string,
    personId: string,
    selectedEventIds: string[],
    status: SubscriptionStatus,
    actorId: string,
  ): Promise<void> {
    const selectedEventIdSet = new Set(selectedEventIds);
    const activeSubscriptions = await tx.eventSubscription.findMany({
      where: {
        personId,
        deletedAt: null,
        event: {
          majorEventId,
          deletedAt: null,
        },
      },
      select: {
        eventId: true,
      },
    });
    const activeEventIdSet = new Set(activeSubscriptions.map((subscription) => subscription.eventId));
    const now = new Date();
    const eventIdsToArchive = [...activeEventIdSet].filter(
      (eventId) => status !== SubscriptionStatus.CONFIRMED || !selectedEventIdSet.has(eventId),
    );

    if (eventIdsToArchive.length > 0) {
      await tx.eventSubscription.updateMany({
        where: {
          personId,
          eventId: {
            in: eventIdsToArchive,
          },
          deletedAt: null,
        },
        data: {
          deletedAt: now,
        },
      });
    }

    const eventIdsToCreate =
      status === SubscriptionStatus.CONFIRMED
        ? selectedEventIds.filter((eventId) => !activeEventIdSet.has(eventId))
        : [];
    if (eventIdsToCreate.length > 0) {
      await tx.eventSubscription.createMany({
        data: eventIdsToCreate.map((eventId) => ({
          eventId,
          personId,
          createdById: actorId,
          createdByMethod: 'ADMIN_DASHBOARD',
        })),
      });
    }
  }

  async refreshEventSubscriptionCounters(tx: Prisma.TransactionClient, eventIds: string[]): Promise<void> {
    const uniqueEventIds = [...new Set(eventIds)];
    if (uniqueEventIds.length === 0) {
      return;
    }

    await Promise.all(
      uniqueEventIds.map(
        (eventId) =>
          tx.$executeRaw`
          UPDATE "events" event
          SET
            "queueCount" = (
              SELECT COUNT(*)::INTEGER
              FROM "major_event_subscription_event_selections" selection
              JOIN "major_event_subscriptions" subscription
                ON subscription."id" = selection."subscriptionId"
              WHERE selection."eventId" = ${eventId}
                AND selection."deletedAt" IS NULL
                AND subscription."deletedAt" IS NULL
                AND subscription."subscriptionStatus" NOT IN ('CONFIRMED', 'CANCELED')
            ),
            "slotsAvailable" = CASE
              WHEN event."slots" IS NULL THEN NULL
              ELSE event."slots" - (
                SELECT COUNT(*)::INTEGER
                FROM "event_subscriptions" event_subscription
                WHERE event_subscription."eventId" = ${eventId}
                  AND event_subscription."deletedAt" IS NULL
              )
            END
          WHERE event."id" = ${eventId}
        `,
      ),
    );
  }
}
