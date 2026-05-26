-- AlterTable
ALTER TABLE "payment_info"
ADD COLUMN "pixKey" TEXT,
ADD COLUMN "pixCity" TEXT;

-- CreateEnum
CREATE TYPE "ReceiptProcessingStatus" AS ENUM ('PENDING', 'OCR_DONE', 'CONVERTED', 'FAILED');

-- CreateTable
CREATE TABLE "major_event_receipts" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "majorEventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT,
    "processingStatus" "ReceiptProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "ocrText" TEXT,
    "expectedAmountCents" INTEGER,
    "matchedAmountCents" INTEGER,
    "amountMatched" BOOLEAN,
    "matchedAmountText" TEXT,
    "nameMatched" BOOLEAN,
    "matchedNameText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "major_event_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "major_event_receipts_subscriptionId_idx" ON "major_event_receipts"("subscriptionId");

-- CreateIndex
CREATE INDEX "major_event_receipts_majorEventId_idx" ON "major_event_receipts"("majorEventId");

-- CreateIndex
CREATE INDEX "major_event_receipts_personId_idx" ON "major_event_receipts"("personId");

-- CreateIndex
CREATE INDEX "major_event_receipts_expiresAt_idx" ON "major_event_receipts"("expiresAt");

-- AddForeignKey
ALTER TABLE "major_event_receipts"
ADD CONSTRAINT "major_event_receipts_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "major_event_subscriptions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
