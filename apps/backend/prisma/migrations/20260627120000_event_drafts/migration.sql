CREATE TABLE "event_drafts" (
  "id" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
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

  CONSTRAINT "event_drafts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "event_drafts"
  ADD CONSTRAINT "event_drafts_sourceEventId_fkey"
  FOREIGN KEY ("sourceEventId")
  REFERENCES "events"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE INDEX "event_drafts_sourceEventId_updatedAt_createdAt_idx"
ON "event_drafts"("sourceEventId", "updatedAt" DESC, "createdAt" DESC);

CREATE INDEX "event_drafts_expiresAt_idx"
ON "event_drafts"("expiresAt");
