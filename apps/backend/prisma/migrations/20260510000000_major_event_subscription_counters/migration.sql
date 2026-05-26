-- Add mutable counters used by public subscription pages.
ALTER TABLE "events"
ADD COLUMN "slotsAvailable" INTEGER,
ADD COLUMN "queueCount" INTEGER NOT NULL DEFAULT 0;

-- Store requested major-event event choices separately from regular event subscriptions.
CREATE TABLE "major_event_subscription_event_selections" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "subscriptionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "major_event_subscription_event_selections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "major_event_subscription_event_selections_subscriptionId_eventId_deletedAt_key"
ON "major_event_subscription_event_selections"("subscriptionId", "eventId", "deletedAt");

CREATE INDEX "major_event_subscription_event_selections_eventId_idx"
ON "major_event_subscription_event_selections"("eventId");

CREATE INDEX "major_event_subscription_event_selections_subscriptionId_idx"
ON "major_event_subscription_event_selections"("subscriptionId");

ALTER TABLE "major_event_subscription_event_selections"
ADD CONSTRAINT "major_event_subscription_event_selections_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "major_event_subscriptions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "major_event_subscription_event_selections"
ADD CONSTRAINT "major_event_subscription_event_selections_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "events"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill requested selections from existing major-event event subscriptions.
INSERT INTO "major_event_subscription_event_selections" (
  "id",
  "subscriptionId",
  "eventId",
  "createdAt",
  "createdById",
  "deletedAt"
)
SELECT
  gen_random_uuid(),
  mes."id",
  es."eventId",
  es."createdAt",
  es."createdById",
  es."deletedAt"
FROM "event_subscriptions" es
JOIN "events" e ON e."id" = es."eventId"
JOIN "major_event_subscriptions" mes
  ON mes."majorEventId" = e."majorEventId"
  AND mes."personId" = es."personId"
  AND mes."deletedAt" IS NULL
WHERE e."majorEventId" IS NOT NULL
  AND e."deletedAt" IS NULL
  AND es."deletedAt" IS NULL
ON CONFLICT DO NOTHING;

-- Backfill queue from non-confirmed, non-canceled requested selections.
UPDATE "events" e
SET "queueCount" = COALESCE(queue_counts."queueCount", 0)
FROM (
  SELECT
    selection."eventId",
    COUNT(*)::INTEGER AS "queueCount"
  FROM "major_event_subscription_event_selections" selection
  JOIN "major_event_subscriptions" mes
    ON mes."id" = selection."subscriptionId"
  WHERE selection."deletedAt" IS NULL
    AND mes."deletedAt" IS NULL
    AND mes."subscriptionStatus" NOT IN ('CONFIRMED', 'CANCELED')
  GROUP BY selection."eventId"
) queue_counts
WHERE e."id" = queue_counts."eventId";

-- Backfill remaining slots from confirmed/regular event subscriptions.
UPDATE "events" e
SET "slotsAvailable" = CASE
  WHEN e."slots" IS NULL THEN NULL
  ELSE e."slots" - COALESCE(confirmed_counts."confirmedCount", 0)
END
FROM (
  SELECT
    es."eventId",
    COUNT(*)::INTEGER AS "confirmedCount"
  FROM "event_subscriptions" es
  LEFT JOIN "events" event
    ON event."id" = es."eventId"
  LEFT JOIN "major_event_subscriptions" mes
    ON mes."majorEventId" = event."majorEventId"
    AND mes."personId" = es."personId"
    AND mes."deletedAt" IS NULL
  WHERE es."deletedAt" IS NULL
    AND (
      event."majorEventId" IS NULL
      OR mes."subscriptionStatus" = 'CONFIRMED'
    )
  GROUP BY es."eventId"
) confirmed_counts
WHERE e."id" = confirmed_counts."eventId";

UPDATE "events"
SET "slotsAvailable" = "slots"
WHERE "slotsAvailable" IS NULL
  AND "slots" IS NOT NULL;
