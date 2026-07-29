CREATE TYPE "EventAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT');

ALTER TYPE "AttendanceCreationMethod" ADD VALUE 'ORAL_CALL' BEFORE 'SCANNER';

ALTER TABLE "event_attendances"
ADD COLUMN "status" "EventAttendanceStatus" NOT NULL DEFAULT 'PRESENT';

CREATE INDEX "event_attendances_eventId_status_idx"
ON "event_attendances"("eventId", "status");

ALTER TABLE "events"
ADD COLUMN "shouldAllowOralAttendance" BOOLEAN NOT NULL DEFAULT false;
