-- CreateEnum
CREATE TYPE "EventManagerPermissionGrantScope" AS ENUM ('GLOBAL', 'EVENT', 'MAJOR_EVENT', 'EVENT_GROUP');

-- CreateTable
CREATE TABLE "event_manager_permission_grants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personId" TEXT,
    "permission" TEXT NOT NULL,
    "scope" "EventManagerPermissionGrantScope" NOT NULL DEFAULT 'GLOBAL',
    "eventId" TEXT,
    "majorEventId" TEXT,
    "eventGroupId" TEXT,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "event_manager_permission_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_manager_permission_grants_userId_idx" ON "event_manager_permission_grants"("userId");

-- CreateIndex
CREATE INDEX "event_manager_permission_grants_personId_idx" ON "event_manager_permission_grants"("personId");

-- CreateIndex
CREATE INDEX "event_manager_permission_grants_permission_idx" ON "event_manager_permission_grants"("permission");

-- CreateIndex
CREATE INDEX "event_manager_permission_grants_scope_idx" ON "event_manager_permission_grants"("scope");

-- CreateIndex
CREATE INDEX "event_manager_permission_grants_eventId_idx" ON "event_manager_permission_grants"("eventId");

-- CreateIndex
CREATE INDEX "event_manager_permission_grants_majorEventId_idx" ON "event_manager_permission_grants"("majorEventId");

-- CreateIndex
CREATE INDEX "event_manager_permission_grants_eventGroupId_idx" ON "event_manager_permission_grants"("eventGroupId");

-- CreateIndex
CREATE INDEX "event_manager_permission_grants_validFrom_idx" ON "event_manager_permission_grants"("validFrom");

-- CreateIndex
CREATE INDEX "event_manager_permission_grants_validUntil_idx" ON "event_manager_permission_grants"("validUntil");

-- CreateIndex
CREATE INDEX "event_manager_permission_grants_deletedAt_idx" ON "event_manager_permission_grants"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "event_manager_permission_grants_global_not_deleted_key"
ON "event_manager_permission_grants"("userId", "permission")
WHERE "deletedAt" IS NULL AND "scope" = 'GLOBAL';

-- CreateIndex
CREATE UNIQUE INDEX "event_manager_permission_grants_event_not_deleted_key"
ON "event_manager_permission_grants"("userId", "permission", "eventId")
WHERE "deletedAt" IS NULL AND "scope" = 'EVENT';

-- CreateIndex
CREATE UNIQUE INDEX "event_manager_permission_grants_major_event_not_deleted_key"
ON "event_manager_permission_grants"("userId", "permission", "majorEventId")
WHERE "deletedAt" IS NULL AND "scope" = 'MAJOR_EVENT';

-- CreateIndex
CREATE UNIQUE INDEX "event_manager_permission_grants_event_group_not_deleted_key"
ON "event_manager_permission_grants"("userId", "permission", "eventGroupId")
WHERE "deletedAt" IS NULL AND "scope" = 'EVENT_GROUP';

-- AddForeignKey
ALTER TABLE "event_manager_permission_grants" ADD CONSTRAINT "event_manager_permission_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_manager_permission_grants" ADD CONSTRAINT "event_manager_permission_grants_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_manager_permission_grants" ADD CONSTRAINT "event_manager_permission_grants_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_manager_permission_grants" ADD CONSTRAINT "event_manager_permission_grants_majorEventId_fkey" FOREIGN KEY ("majorEventId") REFERENCES "major_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_manager_permission_grants" ADD CONSTRAINT "event_manager_permission_grants_eventGroupId_fkey" FOREIGN KEY ("eventGroupId") REFERENCES "event_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
