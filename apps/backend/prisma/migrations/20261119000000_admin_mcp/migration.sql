CREATE TYPE "McpAdminCapability" AS ENUM ('EVENT_READ', 'ATTENDANCE_READ', 'DESCRIPTION_PROPOSE');
CREATE TYPE "McpProposalState" AS ENUM ('PENDING', 'APPLIED', 'REJECTED');

CREATE TABLE "mcp_admin_delegations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "eventIds" TEXT[] NOT NULL,
  "capabilities" "McpAdminCapability"[] NOT NULL,
  "maxProposals" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "mcp_admin_delegations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mcp_admin_delegations_proposal_limit" CHECK ("maxProposals" BETWEEN 1 AND 20),
  CONSTRAINT "mcp_admin_delegations_event_limit" CHECK (cardinality("eventIds") BETWEEN 1 AND 20),
  CONSTRAINT "mcp_admin_delegations_capabilities" CHECK (cardinality("capabilities") BETWEEN 1 AND 3),
  CONSTRAINT "mcp_admin_delegations_expiry" CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + interval '24 hours')
);

CREATE TABLE "mcp_admin_proposals" (
  "id" TEXT NOT NULL,
  "delegationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "descriptionBefore" TEXT,
  "descriptionAfter" TEXT NOT NULL,
  "baseUpdatedAt" TIMESTAMP(3) NOT NULL,
  "state" "McpProposalState" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "decidedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "approvedByName" TEXT,
  CONSTRAINT "mcp_admin_proposals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mcp_admin_proposals_description_limit" CHECK (char_length("descriptionAfter") BETWEEN 1 AND 20000),
  CONSTRAINT "mcp_admin_proposals_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "mcp_admin_delegations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "mcp_admin_proposals_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "mcp_admin_operation_logs" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "clientId" TEXT,
  "delegationId" TEXT,
  "tool" TEXT NOT NULL,
  "eventId" TEXT,
  "proposalId" TEXT,
  "outcome" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mcp_admin_operation_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mcp_event_content_sync" (
  "eventId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "leaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mcp_event_content_sync_pkey" PRIMARY KEY ("eventId"),
  CONSTRAINT "mcp_event_content_sync_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "mcp_admin_delegations_userId_createdAt_idx" ON "mcp_admin_delegations"("userId", "createdAt");
CREATE INDEX "mcp_admin_delegations_userId_clientId_expiresAt_idx" ON "mcp_admin_delegations"("userId", "clientId", "expiresAt");
CREATE INDEX "mcp_admin_delegations_expiresAt_idx" ON "mcp_admin_delegations"("expiresAt");
CREATE UNIQUE INDEX "mcp_admin_proposals_delegationId_idempotencyKey_key" ON "mcp_admin_proposals"("delegationId", "idempotencyKey");
CREATE INDEX "mcp_admin_proposals_delegationId_createdAt_idx" ON "mcp_admin_proposals"("delegationId", "createdAt");
CREATE INDEX "mcp_admin_proposals_eventId_state_idx" ON "mcp_admin_proposals"("eventId", "state");
CREATE INDEX "mcp_event_content_sync_leaseUntil_createdAt_idx" ON "mcp_event_content_sync"("leaseUntil", "createdAt");
CREATE INDEX "mcp_admin_proposals_expiresAt_idx" ON "mcp_admin_proposals"("expiresAt");
CREATE INDEX "mcp_admin_operation_logs_userId_createdAt_idx" ON "mcp_admin_operation_logs"("userId", "createdAt");
CREATE INDEX "mcp_admin_operation_logs_createdAt_idx" ON "mcp_admin_operation_logs"("createdAt");
