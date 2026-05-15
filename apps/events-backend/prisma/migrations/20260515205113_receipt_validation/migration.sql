-- DropForeignKey
ALTER TABLE "major_event_receipt_validation_actions" DROP CONSTRAINT "major_event_receipt_validation_actions_receiptId_fkey";

-- AlterTable
ALTER TABLE "major_event_subscriptions" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "major_event_receipt_validation_actions" ADD CONSTRAINT "major_event_receipt_validation_actions_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "major_event_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
