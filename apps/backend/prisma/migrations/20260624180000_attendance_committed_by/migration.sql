ALTER TABLE "event_attendances"
ADD COLUMN "committedById" TEXT;

CREATE TYPE "OfflineEventAttendanceSubmissionStatus" AS ENUM ('PENDING', 'COMMITTED', 'REJECTED');

CREATE TABLE "offline_event_attendance_submissions" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "personId" TEXT,
  "status" "OfflineEventAttendanceSubmissionStatus" NOT NULL DEFAULT 'PENDING',
  "createdByMethod" "AttendanceCreationMethod" NOT NULL,
  "scannerCode" TEXT,
  "manualValue" TEXT,
  "collectedAt" TIMESTAMP(3) NOT NULL,
  "authorUserId" TEXT,
  "authorName" TEXT,
  "authorEmail" TEXT,
  "submittedById" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stagedReason" TEXT,
  "resolutionError" TEXT,
  "collectedLatitude" DOUBLE PRECISION,
  "collectedLongitude" DOUBLE PRECISION,
  "collectedAccuracyMeters" DOUBLE PRECISION,
  "committedAt" TIMESTAMP(3),
  "committedById" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectedById" TEXT,
  "rejectionReason" TEXT,

  CONSTRAINT "offline_event_attendance_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offline_event_attendance_submissions_submittedById_clientId_key"
ON "offline_event_attendance_submissions"("submittedById", "clientId");

CREATE INDEX "offline_event_attendance_submissions_eventId_status_idx"
ON "offline_event_attendance_submissions"("eventId", "status");

CREATE INDEX "offline_event_attendance_submissions_personId_idx"
ON "offline_event_attendance_submissions"("personId");

CREATE INDEX "offline_event_attendance_submissions_submittedById_idx"
ON "offline_event_attendance_submissions"("submittedById");

CREATE INDEX "offline_event_attendance_submissions_committedById_idx"
ON "offline_event_attendance_submissions"("committedById");

CREATE INDEX "offline_event_attendance_submissions_rejectedById_idx"
ON "offline_event_attendance_submissions"("rejectedById");

ALTER TABLE "offline_event_attendance_submissions"
ADD CONSTRAINT "offline_event_attendance_submissions_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "offline_event_attendance_submissions"
ADD CONSTRAINT "offline_event_attendance_submissions_personId_fkey"
FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
