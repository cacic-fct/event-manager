ALTER TABLE "mcp_admin_commands" ADD COLUMN "result" JSONB;

CREATE TABLE "mcp_admin_file_artifacts" (
  "id" TEXT NOT NULL,
  "delegationId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "target" JSONB NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "uploadedBytes" INTEGER NOT NULL DEFAULT 0,
  "ready" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mcp_admin_file_artifacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mcp_admin_file_artifacts_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "mcp_admin_operation_delegations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "mcp_admin_file_artifacts_size_check" CHECK ("sizeBytes" BETWEEN 0 AND 67108864 AND "uploadedBytes" BETWEEN 0 AND "sizeBytes"),
  CONSTRAINT "mcp_admin_file_artifacts_ready_check" CHECK (NOT "ready" OR "uploadedBytes" = "sizeBytes")
);
CREATE INDEX "mcp_admin_file_artifacts_delegationId_expiresAt_idx" ON "mcp_admin_file_artifacts"("delegationId", "expiresAt");
CREATE INDEX "mcp_admin_file_artifacts_expiresAt_idx" ON "mcp_admin_file_artifacts"("expiresAt");

CREATE TABLE "mcp_admin_file_artifact_chunks" (
  "artifactId" TEXT NOT NULL,
  "offset" INTEGER NOT NULL,
  "bytes" BYTEA NOT NULL,
  CONSTRAINT "mcp_admin_file_artifact_chunks_pkey" PRIMARY KEY ("artifactId", "offset"),
  CONSTRAINT "mcp_admin_file_artifact_chunks_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "mcp_admin_file_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "mcp_admin_file_artifact_chunks_offset_check" CHECK ("offset" >= 0 AND "offset" % 49152 = 0),
  CONSTRAINT "mcp_admin_file_artifact_chunks_size_check" CHECK (octet_length("bytes") BETWEEN 1 AND 49152)
);
