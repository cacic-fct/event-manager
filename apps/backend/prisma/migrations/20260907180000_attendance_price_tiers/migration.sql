ALTER TABLE "events" ADD COLUMN "regularAttendancePriceTierIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TYPE "AttendanceCurrentAssessment" AS ENUM (
  'ACTIVITY_SUBSCRIPTION_MISSING',
  'MAJOR_EVENT_PAYMENT_AWAITING_RECEIPT',
  'MAJOR_EVENT_PAYMENT_NOT_CONFIRMED',
  'MAJOR_EVENT_PAYMENT_UNDER_REVIEW',
  'PRICE_TIER_NOT_ELIGIBLE',
  'REQUIREMENTS_CURRENTLY_MET'
);
ALTER TABLE "event_attendances" ADD COLUMN "currentAssessment" "AttendanceCurrentAssessment";
UPDATE "event_attendances"
SET "currentAssessment" = (CASE "category"::text
  WHEN 'NON_PAYING' THEN 'MAJOR_EVENT_PAYMENT_NOT_CONFIRMED'
  WHEN 'NON_SUBSCRIBED' THEN 'ACTIVITY_SUBSCRIPTION_MISSING'
  WHEN 'REGULAR' THEN 'REQUIREMENTS_CURRENTLY_MET'
  ELSE NULL
END)::"AttendanceCurrentAssessment";

ALTER TYPE "AttendanceCategory" RENAME TO "AttendanceCategory_old";
CREATE TYPE "AttendanceCategory" AS ENUM ('NON_REGULAR', 'REGULAR', 'UNKNOWN');
ALTER TABLE "event_attendances" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "event_attendances" ALTER COLUMN "category" TYPE "AttendanceCategory"
USING (CASE WHEN "category"::text IN ('NON_PAYING', 'NON_SUBSCRIBED') THEN 'NON_REGULAR'
  ELSE "category"::text END)::"AttendanceCategory";
ALTER TABLE "event_attendances" ALTER COLUMN "category" SET DEFAULT 'UNKNOWN'::"AttendanceCategory";
DROP TYPE "AttendanceCategory_old";
