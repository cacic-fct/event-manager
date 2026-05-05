/*
  Warnings:

  - You are about to drop the column `metadata` on the `certificate_configs` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "certificate_configs" DROP COLUMN "metadata",
ADD COLUMN     "certificateFields" JSONB;
