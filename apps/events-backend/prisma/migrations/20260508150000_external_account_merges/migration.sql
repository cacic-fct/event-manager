-- CreateEnum
CREATE TYPE "ExternalAccountMergeStatus" AS ENUM ('APPLIED', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "ExternalAccountMergeResult" AS ENUM ('PEOPLE_MERGED', 'PERSON_REASSIGNED', 'ALREADY_APPLIED', 'NO_LOCAL_PERSON');

-- CreateTable
CREATE TABLE "account_user_merges" (
    "oldUserId" TEXT NOT NULL,
    "newUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_user_merges_pkey" PRIMARY KEY ("oldUserId")
);

-- CreateTable
CREATE TABLE "external_account_merge_operations" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "oldUserId" TEXT NOT NULL,
    "newUserId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "status" "ExternalAccountMergeStatus" NOT NULL DEFAULT 'APPLIED',
    "result" "ExternalAccountMergeResult",
    "peopleMergeOperationId" TEXT,
    "requestPayload" JSONB NOT NULL,
    "errorMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "rolledBackAt" TIMESTAMP(3),
    "rolledBackById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "external_account_merge_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_user_merges_newUserId_idx" ON "account_user_merges"("newUserId");

-- CreateIndex
CREATE UNIQUE INDEX "external_account_merge_operations_eventId_key" ON "external_account_merge_operations"("eventId");

-- CreateIndex
CREATE INDEX "external_account_merge_operations_oldUserId_idx" ON "external_account_merge_operations"("oldUserId");

-- CreateIndex
CREATE INDEX "external_account_merge_operations_newUserId_idx" ON "external_account_merge_operations"("newUserId");

-- CreateIndex
CREATE INDEX "external_account_merge_operations_status_idx" ON "external_account_merge_operations"("status");

-- CreateIndex
CREATE INDEX "external_account_merge_operations_peopleMergeOperationId_idx" ON "external_account_merge_operations"("peopleMergeOperationId");

-- AddForeignKey
ALTER TABLE "external_account_merge_operations" ADD CONSTRAINT "external_account_merge_operations_peopleMergeOperationId_fkey" FOREIGN KEY ("peopleMergeOperationId") REFERENCES "people_merge_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
