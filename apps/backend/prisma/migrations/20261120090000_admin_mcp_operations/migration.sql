CREATE TABLE "mcp_admin_operation_delegations" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "operations" TEXT[] NOT NULL,
  "scope" JSONB NOT NULL,
  "personalData" BOOLEAN NOT NULL DEFAULT false,
  "maxProposals" INTEGER NOT NULL CHECK ("maxProposals" BETWEEN 1 AND 20),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CHECK (cardinality("operations") BETWEEN 1 AND 300),
  CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + interval '24 hours'),
  CHECK (jsonb_typeof("scope") = 'object')
);
CREATE TABLE "mcp_admin_commands" (
  "id" TEXT PRIMARY KEY,
  "delegationId" TEXT NOT NULL REFERENCES "mcp_admin_operation_delegations"("id") ON DELETE CASCADE,
  "operation" TEXT NOT NULL,
  "arguments" JSONB NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("state" IN ('PENDING', 'APPLYING', 'APPLIED', 'REJECTED', 'UNCERTAIN')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "decidedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "approvedByName" TEXT,
  "reviewedArguments" JSONB,
  CHECK (jsonb_typeof("arguments") = 'object'),
  UNIQUE ("delegationId", "idempotencyKey")
);
CREATE INDEX "mcp_admin_operation_delegations_userId_clientId_expiresAt_idx" ON "mcp_admin_operation_delegations"("userId", "clientId", "expiresAt");
CREATE INDEX "mcp_admin_operation_delegations_expiresAt_idx" ON "mcp_admin_operation_delegations"("expiresAt");
CREATE INDEX "mcp_admin_commands_delegationId_createdAt_idx" ON "mcp_admin_commands"("delegationId", "createdAt");
CREATE INDEX "mcp_admin_commands_state_decidedAt_idx" ON "mcp_admin_commands"("state", "decidedAt");
CREATE INDEX "mcp_admin_commands_expiresAt_idx" ON "mcp_admin_commands"("expiresAt");
