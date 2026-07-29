CREATE TYPE "EventAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT');

ALTER TYPE "AttendanceCreationMethod" ADD VALUE 'ORAL_CALL';

ALTER TABLE "event_attendances"
ADD COLUMN "status" "EventAttendanceStatus" NOT NULL DEFAULT 'PRESENT';

ALTER TABLE "events"
ADD COLUMN "shouldAllowOralAttendance" BOOLEAN NOT NULL DEFAULT false;
