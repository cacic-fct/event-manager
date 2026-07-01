CREATE TYPE "EventFormSigilo" AS ENUM ('PUBLIC', 'PARTIALLY_SECRET', 'SECRET', 'ANONYMOUS');

CREATE TYPE "EventFormAudience" AS ENUM ('SUBSCRIBERS', 'ATTENDEES', 'SUBSCRIBERS_OR_ATTENDEES');

CREATE TYPE "EventFormTargetType" AS ENUM ('EVENT', 'MAJOR_EVENT');

CREATE TYPE "EventFormResponseSource" AS ENUM ('PUBLIC_FORM', 'SUBSCRIPTION_FLOW', 'LECTURER_PUBLISH');

CREATE TABLE "event_forms" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "ownerEventId" TEXT,
  "ownerMajorEventId" TEXT,
  "elements" JSONB NOT NULL,
  "sigilo" "EventFormSigilo" NOT NULL DEFAULT 'SECRET',
  "resultsPublic" BOOLEAN NOT NULL DEFAULT false,
  "resultsLive" BOOLEAN NOT NULL DEFAULT false,
  "publicationState" "PublicationState" NOT NULL DEFAULT 'DRAFT',
  "scheduledPublishAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "unpublishedAt" TIMESTAMP(3),
  "publicationScheduledBy" TEXT,
  "publicationUpdatedBy" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedById" TEXT,

  CONSTRAINT "event_forms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_form_links" (
  "id" TEXT NOT NULL,
  "formId" TEXT NOT NULL,
  "targetType" "EventFormTargetType" NOT NULL,
  "eventId" TEXT,
  "majorEventId" TEXT,
  "audience" "EventFormAudience" NOT NULL DEFAULT 'SUBSCRIBERS_OR_ATTENDEES',
  "insertInSubscriptionFlow" BOOLEAN NOT NULL DEFAULT false,
  "requiredInSubscriptionFlow" BOOLEAN NOT NULL DEFAULT false,
  "enforceRequiredAnswers" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "availableFrom" TIMESTAMP(3),
  "availableUntil" TIMESTAMP(3),
  "notifyOnPublish" BOOLEAN NOT NULL DEFAULT true,
  "lastNotifiedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedById" TEXT,

  CONSTRAINT "event_form_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_form_links_target_check" CHECK (
    ("targetType" = 'EVENT' AND "eventId" IS NOT NULL AND "majorEventId" IS NULL)
    OR ("targetType" = 'MAJOR_EVENT' AND "majorEventId" IS NOT NULL AND "eventId" IS NULL)
  )
);

CREATE TABLE "event_form_responses" (
  "id" TEXT NOT NULL,
  "formId" TEXT NOT NULL,
  "linkId" TEXT,
  "targetType" "EventFormTargetType" NOT NULL,
  "eventId" TEXT,
  "majorEventId" TEXT,
  "personId" TEXT NOT NULL,
  "answers" JSONB NOT NULL,
  "source" "EventFormResponseSource" NOT NULL DEFAULT 'PUBLIC_FORM',
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "event_form_responses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_form_responses_target_check" CHECK (
    ("targetType" = 'EVENT' AND "eventId" IS NOT NULL AND "majorEventId" IS NULL)
    OR ("targetType" = 'MAJOR_EVENT' AND "majorEventId" IS NOT NULL AND "eventId" IS NULL)
  )
);

CREATE TABLE "event_form_drafts" (
  "id" TEXT NOT NULL,
  "sourceFormId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdByEmail" TEXT,
  "updatedById" TEXT,
  "updatedByName" TEXT,
  "updatedByEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "event_form_drafts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "event_forms"
  ADD CONSTRAINT "event_forms_ownerEventId_fkey"
  FOREIGN KEY ("ownerEventId")
  REFERENCES "events"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "event_forms"
  ADD CONSTRAINT "event_forms_ownerMajorEventId_fkey"
  FOREIGN KEY ("ownerMajorEventId")
  REFERENCES "major_events"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "event_form_links"
  ADD CONSTRAINT "event_form_links_formId_fkey"
  FOREIGN KEY ("formId")
  REFERENCES "event_forms"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "event_form_links"
  ADD CONSTRAINT "event_form_links_eventId_fkey"
  FOREIGN KEY ("eventId")
  REFERENCES "events"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "event_form_links"
  ADD CONSTRAINT "event_form_links_majorEventId_fkey"
  FOREIGN KEY ("majorEventId")
  REFERENCES "major_events"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "event_form_responses"
  ADD CONSTRAINT "event_form_responses_formId_fkey"
  FOREIGN KEY ("formId")
  REFERENCES "event_forms"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "event_form_responses"
  ADD CONSTRAINT "event_form_responses_linkId_fkey"
  FOREIGN KEY ("linkId")
  REFERENCES "event_form_links"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "event_form_responses"
  ADD CONSTRAINT "event_form_responses_eventId_fkey"
  FOREIGN KEY ("eventId")
  REFERENCES "events"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "event_form_responses"
  ADD CONSTRAINT "event_form_responses_majorEventId_fkey"
  FOREIGN KEY ("majorEventId")
  REFERENCES "major_events"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "event_form_responses"
  ADD CONSTRAINT "event_form_responses_personId_fkey"
  FOREIGN KEY ("personId")
  REFERENCES "people"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "event_form_drafts"
  ADD CONSTRAINT "event_form_drafts_sourceFormId_fkey"
  FOREIGN KEY ("sourceFormId")
  REFERENCES "event_forms"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE INDEX "event_forms_ownerEventId_idx" ON "event_forms"("ownerEventId");
CREATE INDEX "event_forms_ownerMajorEventId_idx" ON "event_forms"("ownerMajorEventId");
CREATE INDEX "event_forms_deletedAt_idx" ON "event_forms"("deletedAt");
CREATE INDEX "event_forms_publicationState_idx" ON "event_forms"("publicationState");
CREATE INDEX "event_forms_scheduledPublishAt_idx" ON "event_forms"("scheduledPublishAt");

CREATE INDEX "event_form_links_formId_idx" ON "event_form_links"("formId");
CREATE INDEX "event_form_links_eventId_idx" ON "event_form_links"("eventId");
CREATE INDEX "event_form_links_majorEventId_idx" ON "event_form_links"("majorEventId");
CREATE INDEX "event_form_links_targetType_idx" ON "event_form_links"("targetType");
CREATE INDEX "event_form_links_deletedAt_idx" ON "event_form_links"("deletedAt");
CREATE INDEX "event_form_links_availableFrom_idx" ON "event_form_links"("availableFrom");
CREATE INDEX "event_form_links_availableUntil_idx" ON "event_form_links"("availableUntil");

CREATE UNIQUE INDEX "event_form_links_formId_eventId_active_key"
ON "event_form_links"("formId", "eventId")
WHERE "eventId" IS NOT NULL AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX "event_form_links_formId_majorEventId_active_key"
ON "event_form_links"("formId", "majorEventId")
WHERE "majorEventId" IS NOT NULL AND "deletedAt" IS NULL;

CREATE INDEX "event_form_responses_formId_idx" ON "event_form_responses"("formId");
CREATE INDEX "event_form_responses_linkId_idx" ON "event_form_responses"("linkId");
CREATE INDEX "event_form_responses_eventId_idx" ON "event_form_responses"("eventId");
CREATE INDEX "event_form_responses_majorEventId_idx" ON "event_form_responses"("majorEventId");
CREATE INDEX "event_form_responses_personId_idx" ON "event_form_responses"("personId");
CREATE INDEX "event_form_responses_submittedAt_idx" ON "event_form_responses"("submittedAt");

CREATE INDEX "event_form_drafts_sourceFormId_updatedAt_createdAt_idx"
ON "event_form_drafts"("sourceFormId", "updatedAt" DESC, "createdAt" DESC);

CREATE INDEX "event_form_drafts_expiresAt_idx"
ON "event_form_drafts"("expiresAt");
