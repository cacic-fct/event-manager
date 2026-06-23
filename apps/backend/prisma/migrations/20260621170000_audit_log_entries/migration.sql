-- CreateEnum
CREATE TYPE "AuditLogEntityType" AS ENUM (
    'PERSON',
    'LECTURER_PROFILE',
    'EVENT',
    'MAJOR_EVENT',
    'EVENT_GROUP',
    'PLACE_PRESET',
    'PERMISSION_GRANT',
    'EVENT_SUBSCRIPTION',
    'EVENT_GROUP_SUBSCRIPTION',
    'MAJOR_EVENT_SUBSCRIPTION',
    'EVENT_ATTENDANCE',
    'EVENT_ATTENDANCE_COLLECTOR',
    'EVENT_LECTURER',
    'CERTIFICATE_CONFIG',
    'CERTIFICATE',
    'MERGE_CANDIDATE',
    'RECEIPT_VALIDATION',
    'SYSTEM'
);

-- CreateEnum
CREATE TYPE "AuditLogOperation" AS ENUM (
    'CREATE',
    'UPDATE',
    'DELETE',
    'MERGE',
    'IMPORT',
    'APPROVE',
    'REJECT',
    'ISSUE',
    'REISSUE',
    'SCAN',
    'UNDO',
    'REVERT',
    'USER_CREATE'
);

-- CreateEnum
CREATE TYPE "AuditLogActorType" AS ENUM ('USER', 'SERVICE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditLogRevertMode" AS ENUM ('ENTRY_ONLY', 'ENTRY_AND_AFTER');

-- CreateTable
CREATE TABLE "audit_log_entries" (
    "id" TEXT NOT NULL,
    "entityType" "AuditLogEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityLabel" TEXT,
    "operation" "AuditLogOperation" NOT NULL,
    "summary" TEXT,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorEmail" TEXT,
    "actorType" "AuditLogActorType" NOT NULL DEFAULT 'USER',
    "permission" TEXT,
    "eventId" TEXT,
    "majorEventId" TEXT,
    "eventGroupId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "changes" JSONB NOT NULL,
    "changedFields" TEXT[] NOT NULL,
    "groupedCount" INTEGER NOT NULL DEFAULT 1,
    "firstRecordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRecordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revertedAt" TIMESTAMP(3),
    "revertedById" TEXT,
    "revertedByName" TEXT,
    "revertedByEntryId" TEXT,
    "revertTargetId" TEXT,
    "revertMode" "AuditLogRevertMode",
    "metadata" JSONB,

    CONSTRAINT "audit_log_entries_changes_array_check" CHECK (jsonb_typeof("changes") = 'array'),
    CONSTRAINT "audit_log_entries_grouped_count_check" CHECK ("groupedCount" >= 1),
    CONSTRAINT "audit_log_entries_recorded_window_check" CHECK ("firstRecordedAt" <= "lastRecordedAt"),
    CONSTRAINT "audit_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_entries_entityType_entityId_idx" ON "audit_log_entries"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_entries_entityType_entityId_lastRecordedAt_idx" ON "audit_log_entries"("entityType", "entityId", "lastRecordedAt");

-- CreateIndex
CREATE INDEX "audit_log_entries_actorId_idx" ON "audit_log_entries"("actorId");

-- CreateIndex
CREATE INDEX "audit_log_entries_operation_idx" ON "audit_log_entries"("operation");

-- CreateIndex
CREATE INDEX "audit_log_entries_permission_idx" ON "audit_log_entries"("permission");

-- CreateIndex
CREATE INDEX "audit_log_entries_eventId_idx" ON "audit_log_entries"("eventId");

-- CreateIndex
CREATE INDEX "audit_log_entries_majorEventId_idx" ON "audit_log_entries"("majorEventId");

-- CreateIndex
CREATE INDEX "audit_log_entries_eventGroupId_idx" ON "audit_log_entries"("eventGroupId");

-- CreateIndex
CREATE INDEX "audit_log_entries_revertedAt_idx" ON "audit_log_entries"("revertedAt");

-- CreateIndex
CREATE INDEX "audit_log_entries_revertTargetId_idx" ON "audit_log_entries"("revertTargetId");
