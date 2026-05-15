-- CreateEnum
CREATE TYPE "ReceiptValidationActionType" AS ENUM ('APPROVE', 'REJECT');

-- AlterTable
ALTER TABLE "major_event_subscriptions"
ADD COLUMN "receiptRejectionReason" TEXT,
ADD COLUMN "receiptValidatedAt" TIMESTAMP(3),
ADD COLUMN "receiptValidatedBy" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "major_event_receipt_validation_actions" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "receiptId" TEXT,
    "action" "ReceiptValidationActionType" NOT NULL,
    "previousStatus" "SubscriptionStatus" NOT NULL,
    "nextStatus" "SubscriptionStatus" NOT NULL,
    "previousRejectionReason" TEXT,
    "nextRejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "undoneAt" TIMESTAMP(3),
    "undoneById" TEXT,

    CONSTRAINT "major_event_receipt_validation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "major_event_receipt_validation_actions_subscriptionId_idx" ON "major_event_receipt_validation_actions"("subscriptionId");

-- CreateIndex
CREATE INDEX "major_event_receipt_validation_actions_receiptId_idx" ON "major_event_receipt_validation_actions"("receiptId");

-- CreateIndex
CREATE INDEX "major_event_receipt_validation_actions_createdAt_idx" ON "major_event_receipt_validation_actions"("createdAt");

-- AddForeignKey
ALTER TABLE "major_event_receipt_validation_actions"
ADD CONSTRAINT "major_event_receipt_validation_actions_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "major_event_subscriptions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "major_event_receipt_validation_actions"
ADD CONSTRAINT "major_event_receipt_validation_actions_receiptId_fkey"
FOREIGN KEY ("receiptId") REFERENCES "major_event_receipts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
