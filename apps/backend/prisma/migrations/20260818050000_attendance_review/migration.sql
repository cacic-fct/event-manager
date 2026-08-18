CREATE TYPE "AttendanceReviewFlagKind" AS ENUM (
  'UNUSUAL_VOLUME',
  'REPEATED_SCAN_ATTEMPTS',
  'OFFLINE_BACKLOG',
  'ATTENDANCE_REMOVAL',
  'DISTANT_LOCATION'
);

CREATE TYPE "AttendanceReviewFlagSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "AttendanceReviewFlagStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISMISSED');

CREATE TABLE "attendance_review_flags" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "personId" TEXT,
  "actorId" TEXT,
  "kind" "AttendanceReviewFlagKind" NOT NULL,
  "severity" "AttendanceReviewFlagSeverity" NOT NULL DEFAULT 'WARNING',
  "status" "AttendanceReviewFlagStatus" NOT NULL DEFAULT 'PENDING',
  "dedupeKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "details" JSONB,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "reviewNote" TEXT,
  CONSTRAINT "attendance_review_flags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_review_flags_dedupeKey_key" ON "attendance_review_flags"("dedupeKey");
CREATE INDEX "attendance_review_flags_status_detectedAt_idx" ON "attendance_review_flags"("status", "detectedAt");
CREATE INDEX "attendance_review_flags_eventId_status_detectedAt_idx" ON "attendance_review_flags"("eventId", "status", "detectedAt");
CREATE INDEX "attendance_review_flags_personId_idx" ON "attendance_review_flags"("personId");
CREATE INDEX "attendance_review_flags_actorId_idx" ON "attendance_review_flags"("actorId");

CREATE TABLE "attendance_scan_attempt_counters" (
  "id" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "actorId" TEXT,
  "method" "AttendanceCreationMethod" NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_scan_attempt_counters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_scan_attempt_counters_dedupeKey_key" ON "attendance_scan_attempt_counters"("dedupeKey");
CREATE INDEX "attendance_scan_attempt_counters_eventId_updatedAt_idx" ON "attendance_scan_attempt_counters"("eventId", "updatedAt");
CREATE INDEX "attendance_scan_attempt_counters_personId_idx" ON "attendance_scan_attempt_counters"("personId");
