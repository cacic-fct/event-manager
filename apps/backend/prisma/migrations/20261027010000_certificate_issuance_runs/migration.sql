CREATE TYPE "CertificateRevocationReason" AS ENUM ('ADMIN', 'MANUAL_RECIPIENT_REMOVED');
ALTER TABLE "certificates" ADD COLUMN "revokedAt" TIMESTAMP(3), ADD COLUMN "revokedById" TEXT, ADD COLUMN "revocationReason" "CertificateRevocationReason";

-- Historical soft deletions did not distinguish admin revocation from automatic
-- invalidation. Preserve them conservatively; admins can explicitly restore them.
UPDATE "certificates"
SET "revokedAt" = "deletedAt", "revocationReason" = 'ADMIN'
WHERE "deletedAt" IS NOT NULL AND "lgpdDeletionRequestId" IS NULL;

CREATE TYPE "CertificateIssuanceRunStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TABLE "certificate_issuance_runs" (
  "id" TEXT NOT NULL,
  "configId" TEXT NOT NULL,
  "status" "CertificateIssuanceRunStatus" NOT NULL DEFAULT 'PENDING',
  "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reissue" BOOLEAN NOT NULL DEFAULT false,
  "notifyRecipients" BOOLEAN NOT NULL DEFAULT true,
  "automatic" BOOLEAN NOT NULL DEFAULT false,
  "requestedById" TEXT,
  "configUpdatedAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "certificateCount" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "certificate_issuance_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "certificate_issuance_runs_configId_fkey" FOREIGN KEY ("configId") REFERENCES "certificate_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "certificate_issuance_runs_status_scheduledAt_idx" ON "certificate_issuance_runs"("status", "scheduledAt");
CREATE INDEX "certificate_issuance_runs_configId_createdAt_idx" ON "certificate_issuance_runs"("configId", "createdAt");
-- One active batch per configuration, including concurrent API/scheduler requests.
CREATE UNIQUE INDEX "certificate_issuance_runs_active_config_key" ON "certificate_issuance_runs"("configId") WHERE "status" IN ('PENDING', 'PROCESSING');

CREATE TABLE "certificate_manual_recipients" (
  "configId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "removedAt" TIMESTAMP(3),
  CONSTRAINT "certificate_manual_recipients_pkey" PRIMARY KEY ("configId", "personId"),
  CONSTRAINT "certificate_manual_recipients_configId_fkey" FOREIGN KEY ("configId") REFERENCES "certificate_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "certificate_manual_recipients_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "certificate_manual_recipients_personId_idx" ON "certificate_manual_recipients"("personId");
INSERT INTO "certificate_manual_recipients" ("configId", "personId", "createdById")
SELECT certificate."configId", certificate."personId", certificate."issuedById"
FROM "certificates" AS certificate
JOIN "certificate_configs" AS config ON config."id" = certificate."configId"
WHERE config."issuedTo" IN ('OTHER', 'SPORTS_ORGANIZER')
  AND certificate."deletedAt" IS NULL;
