-- CreateTable
CREATE TABLE "certificate_folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '📁',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "certificate_folders_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "certificate_configs" ADD COLUMN "folderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "certificate_folders_name_key" ON "certificate_folders"("name");

-- CreateIndex
CREATE INDEX "certificate_configs_folderId_idx" ON "certificate_configs"("folderId");

-- AddForeignKey
ALTER TABLE "certificate_configs" ADD CONSTRAINT "certificate_configs_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "certificate_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
