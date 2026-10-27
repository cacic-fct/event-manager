ALTER TABLE "events"
  ADD COLUMN "lecturerInformation" TEXT,
  ADD COLUMN "collectorInformation" TEXT,
  ADD COLUMN "preparationUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "materials" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "materialsUpdatedAt" TIMESTAMP(3);
