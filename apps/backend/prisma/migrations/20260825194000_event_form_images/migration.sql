-- AlterTable
ALTER TABLE "event_forms" ADD COLUMN     "descriptionImages" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "event_form_images" (
    "id" TEXT NOT NULL,
    "formId" TEXT,
    "objectKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "originalMimeType" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_form_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_form_images_objectKey_key" ON "event_form_images"("objectKey");

-- CreateIndex
CREATE INDEX "event_form_images_formId_sha256_idx" ON "event_form_images"("formId", "sha256");

-- CreateIndex
CREATE INDEX "event_form_images_createdById_sha256_idx" ON "event_form_images"("createdById", "sha256");

-- CreateIndex
CREATE INDEX "event_form_images_createdAt_idx" ON "event_form_images"("createdAt");

-- CreateIndex
CREATE INDEX "event_form_images_updatedAt_idx" ON "event_form_images"("updatedAt");

-- AddForeignKey
ALTER TABLE "event_form_images" ADD CONSTRAINT "event_form_images_formId_fkey" FOREIGN KEY ("formId") REFERENCES "event_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
