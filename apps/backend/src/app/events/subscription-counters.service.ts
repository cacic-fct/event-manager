import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class EventSubscriptionCountersService {
  async refresh(tx: Prisma.TransactionClient, eventIds: Iterable<string>): Promise<void> {
    const uniqueEventIds = [...new Set([...eventIds].filter(Boolean))];
    if (uniqueEventIds.length === 0) {
      return;
    }

    // Lock in ID order while allowing foreign-key key-share locks from subscription inserts.
    await tx.$executeRaw`
      WITH target_events AS (
        SELECT "id", "slots"
        FROM "events"
        WHERE "id" = ANY(${uniqueEventIds}::text[])
        ORDER BY "id"
        FOR NO KEY UPDATE
      ),
      counters AS MATERIALIZED (
        SELECT
          event."id",
          (
            SELECT COUNT(*)::INTEGER
            FROM "major_event_subscription_event_selections" selection
            JOIN "major_event_subscriptions" subscription
              ON subscription."id" = selection."subscriptionId"
            WHERE selection."eventId" = event."id"
              AND selection."deletedAt" IS NULL
              AND subscription."deletedAt" IS NULL
              AND subscription."subscriptionStatus" NOT IN ('CONFIRMED', 'CANCELED')
          ) AS "queueCount",
          CASE
            WHEN event."slots" IS NULL THEN NULL
            ELSE event."slots" - (
              SELECT COUNT(*)::INTEGER
              FROM "event_subscriptions" event_subscription
              WHERE event_subscription."eventId" = event."id"
                AND event_subscription."deletedAt" IS NULL
            )
          END AS "slotsAvailable"
        FROM target_events event
      )
      UPDATE "events" event
      SET
        "queueCount" = counters."queueCount",
        "slotsAvailable" = counters."slotsAvailable"
      FROM counters
      WHERE event."id" = counters."id"
        AND (
          event."queueCount" IS DISTINCT FROM counters."queueCount"
          OR event."slotsAvailable" IS DISTINCT FROM counters."slotsAvailable"
        )
    `;
  }
}
