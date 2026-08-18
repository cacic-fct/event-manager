WITH ranked_active_group_subscriptions AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "eventGroupId", "personId"
      ORDER BY
        "imageLicenseAgreementAccepted" DESC,
        ("createdById" IS NOT NULL) DESC,
        "createdAt" ASC,
        "id" ASC
    ) AS row_number
  FROM "event_group_subscriptions"
  WHERE "deletedAt" IS NULL
)
UPDATE "event_group_subscriptions" AS subscription
SET "deletedAt" = CURRENT_TIMESTAMP + ((duplicate.row_number - 1) * INTERVAL '1 millisecond')
FROM ranked_active_group_subscriptions AS duplicate
WHERE subscription."id" = duplicate."id"
  AND duplicate.row_number > 1;

-- Recreate the old group-subscription backfill without duplicating an already
-- existing active subscription on a production-derived database.
INSERT INTO "event_group_subscriptions" (
  "id",
  "eventGroupId",
  "personId",
  "createdAt",
  "createdById",
  "deletedAt"
)
SELECT
  'egs_' || md5(subscription."personId" || ':' || event."eventGroupId"),
  event."eventGroupId",
  subscription."personId",
  MIN(subscription."createdAt"),
  MIN(subscription."createdById"),
  NULL
FROM "event_subscriptions" AS subscription
INNER JOIN "events" AS event
  ON event."id" = subscription."eventId"
WHERE subscription."deletedAt" IS NULL
  AND event."deletedAt" IS NULL
  AND event."eventGroupId" IS NOT NULL
  AND event."majorEventId" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "event_group_subscriptions" AS existing
    WHERE existing."eventGroupId" = event."eventGroupId"
      AND existing."personId" = subscription."personId"
      AND existing."deletedAt" IS NULL
  )
GROUP BY event."eventGroupId", subscription."personId"
ON CONFLICT DO NOTHING;

-- Point active event subscriptions at the surviving active group subscription
-- when a manually-applied loose migration left the link missing or stale.
UPDATE "event_subscriptions" AS subscription
SET "eventGroupSubscriptionId" = group_subscription."id"
FROM "events" AS event
INNER JOIN "event_group_subscriptions" AS group_subscription
  ON group_subscription."eventGroupId" = event."eventGroupId"
WHERE event."id" = subscription."eventId"
  AND subscription."deletedAt" IS NULL
  AND event."deletedAt" IS NULL
  AND event."eventGroupId" IS NOT NULL
  AND event."majorEventId" IS NULL
  AND group_subscription."personId" = subscription."personId"
  AND group_subscription."deletedAt" IS NULL
  AND (
    subscription."eventGroupSubscriptionId" IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM "event_group_subscriptions" AS current_group_subscription
      WHERE current_group_subscription."id" = subscription."eventGroupSubscriptionId"
        AND current_group_subscription."eventGroupId" = event."eventGroupId"
        AND current_group_subscription."personId" = subscription."personId"
        AND current_group_subscription."deletedAt" IS NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS "event_group_subscription_unique_active"
ON "event_group_subscriptions" ("eventGroupId", "personId")
WHERE "deletedAt" IS NULL;
