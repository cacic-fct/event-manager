-- AlterTable
ALTER TABLE "event_attendances" ADD COLUMN     "collectedAccuracyMeters" DOUBLE PRECISION,
ADD COLUMN     "collectedLatitude" DOUBLE PRECISION,
ADD COLUMN     "collectedLongitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "event_attendance_collectors" (
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "event_attendance_collectors_pkey" PRIMARY KEY ("eventId","personId")
);

-- CreateIndex
CREATE INDEX "event_attendance_collectors_personId_idx" ON "event_attendance_collectors"("personId");

-- AddForeignKey
ALTER TABLE "event_attendance_collectors" ADD CONSTRAINT "event_attendance_collectors_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendance_collectors" ADD CONSTRAINT "event_attendance_collectors_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
