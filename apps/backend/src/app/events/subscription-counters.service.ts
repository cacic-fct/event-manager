import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class EventSubscriptionCountersService {
  async refresh(tx: Prisma.TransactionClient, eventIds: Iterable<string>): Promise<void> {
    const uniqueEventIds = [...new Set([...eventIds].filter(Boolean))];
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
