DROP TRIGGER IF EXISTS "trg_payment_info" ON "major_events";

WITH ranked_active_subscriptions AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "eventId", "personId"
      ORDER BY
        ("eventGroupSubscriptionId" IS NOT NULL) DESC,
        "imageLicenseAgreementAccepted" DESC,
        ("createdById" IS NOT NULL) DESC,
        "createdAt" ASC,
        "id" ASC
    ) AS row_number
  FROM "event_subscriptions"
  WHERE "deletedAt" IS NULL
)
UPDATE "event_subscriptions" AS subscription
SET "deletedAt" = CURRENT_TIMESTAMP + ((duplicate.row_number - 1) * INTERVAL '1 millisecond')
FROM ranked_active_subscriptions AS duplicate
WHERE subscription."id" = duplicate."id"
  AND duplicate.row_number > 1;

DROP INDEX IF EXISTS "major_event_subscription_unique";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = '"major_event_subscriptions"'::regclass
      AND conname = 'amount_paid_positive'
  ) THEN
    EXECUTE 'ALTER TABLE "major_event_subscriptions" ADD CONSTRAINT "amount_paid_positive" CHECK ("amountPaid" IS NULL OR "amountPaid" >= 0) NOT VALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "major_event_subscriptions"
    WHERE "amountPaid" < 0
  ) THEN
    RAISE WARNING 'amount_paid_positive remains NOT VALID because legacy negative amountPaid rows exist; new writes are still checked.';
  ELSIF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = '"major_event_subscriptions"'::regclass
      AND conname = 'amount_paid_positive'
      AND NOT convalidated
  ) THEN
    EXECUTE 'ALTER TABLE "major_event_subscriptions" VALIDATE CONSTRAINT "amount_paid_positive"';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = '"events"'::regclass
      AND conname = 'events_date_check'
  ) THEN
    EXECUTE 'ALTER TABLE "events" ADD CONSTRAINT "events_date_check" CHECK ("startDate" <= "endDate") NOT VALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "events"
    WHERE "startDate" > "endDate"
  ) THEN
    RAISE WARNING 'events_date_check remains NOT VALID because legacy events with reversed dates exist; new writes are still checked.';
  ELSIF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = '"events"'::regclass
      AND conname = 'events_date_check'
      AND NOT convalidated
  ) THEN
    EXECUTE 'ALTER TABLE "events" VALIDATE CONSTRAINT "events_date_check"';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = '"major_events"'::regclass
      AND conname = 'major_events_date_check'
  ) THEN
    EXECUTE 'ALTER TABLE "major_events" ADD CONSTRAINT "major_events_date_check" CHECK ("startDate" <= "endDate") NOT VALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "major_events"
    WHERE "startDate" > "endDate"
  ) THEN
    RAISE WARNING 'major_events_date_check remains NOT VALID because legacy major events with reversed dates exist; new writes are still checked.';
  ELSIF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = '"major_events"'::regclass
      AND conname = 'major_events_date_check'
      AND NOT convalidated
  ) THEN
    EXECUTE 'ALTER TABLE "major_events" VALIDATE CONSTRAINT "major_events_date_check"';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "event_subscription_unique_active"
ON "event_subscriptions" ("eventId", "personId")
WHERE "deletedAt" IS NULL;

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

-- Recreate the legacy group-subscription backfill without duplicating an
-- already existing active subscription on a production-derived database.
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

-- Repair missing or stale links left by a manually applied legacy backfill.
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
