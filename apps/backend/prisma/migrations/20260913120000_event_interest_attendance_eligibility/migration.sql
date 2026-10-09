CREATE TYPE "AttendanceEligibility" AS ENUM (
  'ANYONE', 'REGISTERED_ONLY', 'APPROVED_REGISTRATIONS_ONLY', 'INVITED_ONLY'
);

ALTER TYPE "EventFormAudience" RENAME TO "EventFormAudience_legacy";
CREATE TYPE "EventFormAudience" AS ENUM ('SUBSCRIBERS', 'ATTENDEES', 'INTERESTED');
ALTER TABLE "event_form_links"
  ADD COLUMN "audiences" "EventFormAudience"[] NOT NULL DEFAULT ARRAY['SUBSCRIBERS', 'ATTENDEES']::"EventFormAudience"[];
UPDATE "event_form_links" SET "audiences" = CASE "audience"::TEXT
  WHEN 'SUBSCRIBERS' THEN ARRAY['SUBSCRIBERS']::"EventFormAudience"[]
  WHEN 'ATTENDEES' THEN ARRAY['ATTENDEES']::"EventFormAudience"[]
  ELSE ARRAY['SUBSCRIBERS', 'ATTENDEES']::"EventFormAudience"[]
END;
ALTER TABLE "event_form_links" DROP COLUMN "audience";
ALTER TABLE "event_form_links" ADD CONSTRAINT "event_form_links_nonempty_audiences" CHECK (cardinality("audiences") > 0);
DROP TYPE "EventFormAudience_legacy";
ALTER TYPE "AttendanceCurrentAssessment" ADD VALUE 'INVITATION_REQUIRED';

-- Nullable child overrides inherit the major event policy; standalone roots
-- resolve to REGISTERED_ONLY.
ALTER TABLE "events"
  ADD COLUMN "interestEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "attendanceEligibility" "AttendanceEligibility";
ALTER TABLE "event_groups"
  ADD COLUMN "interestEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "attendanceEligibility" "AttendanceEligibility";
ALTER TABLE "major_events"
  ADD COLUMN "interestEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "attendanceEligibility" "AttendanceEligibility" NOT NULL DEFAULT 'APPROVED_REGISTRATIONS_ONLY';

-- Existing standalone activities without registrations allowed online
-- attendance without a subscription. Preserve that access, including activities
-- in standalone groups, while leaving parent inheritance and new defaults intact.
-- BEGIN LEGACY ATTENDANCE BACKFILL
UPDATE "events" AS event
SET "attendanceEligibility" = 'ANYONE'::"AttendanceEligibility"
WHERE NOT event."allowSubscription"
  AND event."majorEventId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "event_groups" AS event_group
    WHERE event_group."id" = event."eventGroupId"
      AND event_group."majorEventId" IS NOT NULL
  );
-- END LEGACY ATTENDANCE BACKFILL

-- Existing configurations keep the event/group/major-event certificate rules.
-- A nullable additional criterion avoids overwriting independent payment and
-- registration exceptions with a new scope-wide default.
ALTER TABLE "certificate_configs"
  ADD COLUMN "attendeeEligibility" "AttendanceEligibility";

CREATE TABLE "event_interests" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "eventId" TEXT,
  "eventGroupId" TEXT,
  "majorEventId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "lgpdDeletionRequestId" TEXT,
  CONSTRAINT "event_interests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_interests_one_target" CHECK (num_nonnulls("eventId", "eventGroupId", "majorEventId") = 1),
  CONSTRAINT "event_interests_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_interests_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_interests_eventGroupId_fkey" FOREIGN KEY ("eventGroupId") REFERENCES "event_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_interests_majorEventId_fkey" FOREIGN KEY ("majorEventId") REFERENCES "major_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "event_interest_event_active_key" ON "event_interests"("eventId", "personId") WHERE "deletedAt" IS NULL AND "eventId" IS NOT NULL;
CREATE UNIQUE INDEX "event_interest_group_active_key" ON "event_interests"("eventGroupId", "personId") WHERE "deletedAt" IS NULL AND "eventGroupId" IS NOT NULL;
CREATE UNIQUE INDEX "event_interest_major_active_key" ON "event_interests"("majorEventId", "personId") WHERE "deletedAt" IS NULL AND "majorEventId" IS NOT NULL;
CREATE INDEX "event_interests_personId_deletedAt_idx" ON "event_interests"("personId", "deletedAt");
CREATE INDEX "event_interests_lgpdDeletionRequestId_idx" ON "event_interests"("lgpdDeletionRequestId");
