-- AlterTable
ALTER TABLE "sports_tournaments"
ADD COLUMN "registrationStartDate" TIMESTAMP(3),
ADD COLUMN "registrationEndDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "sports_tournaments_registrationStartDate_registrationEndDate_idx"
ON "sports_tournaments"("registrationStartDate", "registrationEndDate");
