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

-- The old loose migration created an unfiltered index. The current schema
-- deliberately permits a person to subscribe again after a soft deletion;
-- its composite Prisma index remains in place for that contract.
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
