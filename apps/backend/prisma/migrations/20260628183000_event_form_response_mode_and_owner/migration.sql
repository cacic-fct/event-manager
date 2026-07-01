CREATE TYPE "EventFormResponseMode" AS ENUM ('ONE_PER_TARGET', 'MULTIPLE_PER_TARGET', 'SINGLE_PER_FORM');

ALTER TABLE "event_forms"
  ADD COLUMN "responseMode" "EventFormResponseMode" NOT NULL DEFAULT 'ONE_PER_TARGET';

ALTER TABLE "event_forms"
  ADD CONSTRAINT "event_forms_owner_required_check"
  CHECK (
    ("ownerEventId" IS NOT NULL AND "ownerMajorEventId" IS NULL)
    OR ("ownerEventId" IS NULL AND "ownerMajorEventId" IS NOT NULL)
  );
