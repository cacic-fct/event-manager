-- Existing standalone activities without registrations allowed online
-- attendance without a subscription. Preserve that access, including activities
-- in standalone groups, while leaving parent inheritance and new defaults intact.
-- Keep policies set after the schema migration untouched, and avoid applying the
-- legacy rule to events created after that migration ran.
DO $$
DECLARE
  legacy_backfill_cutoff TIMESTAMPTZ;
BEGIN
  IF to_regclass('"_prisma_migrations"') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $lookup$
    SELECT migration."started_at"
    FROM "_prisma_migrations" AS migration
    WHERE migration."migration_name" = '20260913120000_event_interest_attendance_eligibility'
      AND migration."finished_at" IS NOT NULL
    ORDER BY migration."started_at" ASC
    LIMIT 1
  $lookup$ INTO legacy_backfill_cutoff;

  IF legacy_backfill_cutoff IS NULL THEN
    RETURN;
  END IF;

  UPDATE "events" AS event
  SET "attendanceEligibility" = 'ANYONE'::"AttendanceEligibility"
  WHERE event."attendanceEligibility" IS NULL
    AND event."createdAt" <= legacy_backfill_cutoff
    AND NOT event."allowSubscription"
    AND event."majorEventId" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "event_groups" AS event_group
      WHERE event_group."id" = event."eventGroupId"
        AND event_group."majorEventId" IS NOT NULL
    );
END;
$$;
