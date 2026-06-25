CREATE TYPE "PublicationState" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'UNPUBLISHED');

CREATE TYPE "PublicContentPreviewTargetType" AS ENUM ('EVENT', 'EVENT_GROUP', 'MAJOR_EVENT');

ALTER TABLE "events"
  ADD COLUMN "publicationState" "PublicationState" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "scheduledPublishAt" TIMESTAMP(3),
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "unpublishedAt" TIMESTAMP(3),
  ADD COLUMN "publicationScheduledBy" TEXT,
  ADD COLUMN "publicationUpdatedBy" TEXT;

ALTER TABLE "major_events"
  ADD COLUMN "publicationState" "PublicationState" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "scheduledPublishAt" TIMESTAMP(3),
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "unpublishedAt" TIMESTAMP(3),
  ADD COLUMN "publicationScheduledBy" TEXT,
  ADD COLUMN "publicationUpdatedBy" TEXT;

UPDATE "major_events"
SET
  "publicationState" = 'PUBLISHED',
  "publishedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP)
WHERE
  "deletedAt" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "events"
    WHERE
      "events"."majorEventId" = "major_events"."id"
      AND "events"."deletedAt" IS NULL
      AND "events"."publiclyVisible" = true
  );

UPDATE "events"
SET
  "publicationState" = 'PUBLISHED',
  "publishedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP)
WHERE
  "deletedAt" IS NULL
  AND "publiclyVisible" = true
  AND (
    "majorEventId" IS NULL
    OR "majorEventId" IN (
      SELECT "id"
      FROM "major_events"
      WHERE "deletedAt" IS NULL
    )
  );

CREATE INDEX "events_publicationState_idx" ON "events"("publicationState");
CREATE INDEX "events_scheduledPublishAt_idx" ON "events"("scheduledPublishAt");
CREATE INDEX "major_events_publicationState_idx" ON "major_events"("publicationState");
CREATE INDEX "major_events_scheduledPublishAt_idx" ON "major_events"("scheduledPublishAt");

CREATE TABLE "public_content_previews" (
  "id" TEXT NOT NULL,
  "previewTokenHash" TEXT NOT NULL,
  "targetType" "PublicContentPreviewTargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "targetLabel" TEXT NOT NULL,
  "previewAt" TIMESTAMP(3),
  "publicPath" TEXT NOT NULL,
  "redisKey" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdByName" TEXT,
  "createdByEmail" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "trimAfter" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "public_content_previews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_content_previews_previewTokenHash_key"
ON "public_content_previews"("previewTokenHash");

CREATE UNIQUE INDEX "public_content_previews_targetType_targetId_createdById_key"
ON "public_content_previews"("targetType", "targetId", "createdById");

CREATE INDEX "public_content_previews_targetType_targetId_idx"
ON "public_content_previews"("targetType", "targetId");

CREATE INDEX "public_content_previews_expiresAt_idx"
ON "public_content_previews"("expiresAt");

CREATE INDEX "public_content_previews_trimAfter_idx"
ON "public_content_previews"("trimAfter");
