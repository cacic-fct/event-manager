-- CreateEnum
CREATE TYPE "AttendanceCategory" AS ENUM ('NON_PAYING', 'NON_SUBSCRIBED', 'REGULAR', 'UNKNOWN');

-- AlterTable
ALTER TABLE "event_attendances" ADD COLUMN     "category" "AttendanceCategory" NOT NULL DEFAULT 'UNKNOWN';
