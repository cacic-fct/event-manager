ALTER TABLE "certificates" ADD COLUMN "issuanceRunId" TEXT;

CREATE INDEX "certificates_issuanceRunId_idx" ON "certificates"("issuanceRunId");

ALTER TABLE "certificates" ADD CONSTRAINT "certificates_issuanceRunId_fkey"
  FOREIGN KEY ("issuanceRunId") REFERENCES "certificate_issuance_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
