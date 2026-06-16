WITH duplicate_active_selections AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "subscriptionId", "eventId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS row_number
  FROM "major_event_subscription_event_selections"
  WHERE "deletedAt" IS NULL
)
DELETE FROM "major_event_subscription_event_selections" selection
USING duplicate_active_selections duplicate
WHERE selection."id" = duplicate."id"
  AND duplicate.row_number > 1;

DROP INDEX IF EXISTS "major_event_subscription_event_selections_subscriptionId_ev_key";
DROP INDEX IF EXISTS "major_event_subscription_event_selections_subscriptionId_eventId_deletedAt_key";

CREATE INDEX IF NOT EXISTS "major_event_subscription_event_selections_subscriptionId_eventId_idx"
ON "major_event_subscription_event_selections"("subscriptionId", "eventId");

CREATE UNIQUE INDEX "major_event_subscription_event_selections_active_key"
ON "major_event_subscription_event_selections"("subscriptionId", "eventId")
WHERE "deletedAt" IS NULL;
