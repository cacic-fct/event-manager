-- CreateEnum
CREATE TYPE "CertificateIssuedTo" AS ENUM ('ATTENDEE', 'LECTURER', 'OTHER');

-- AlterTable
ALTER TABLE "certificate_configs"
ADD COLUMN "issuedTo" "CertificateIssuedTo" NOT NULL DEFAULT 'OTHER';
