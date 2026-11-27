ALTER TYPE "McpAdminCapability" ADD VALUE 'PREPARATION_READ';
ALTER TYPE "McpAdminCapability" ADD VALUE 'MATERIALS_READ';
ALTER TYPE "McpAdminCapability" ADD VALUE 'SUBSCRIPTIONS_READ';
ALTER TYPE "McpAdminCapability" ADD VALUE 'FORMS_READ';
ALTER TYPE "McpAdminCapability" ADD VALUE 'CONTENT_REVIEWS_READ';
ALTER TYPE "McpAdminCapability" ADD VALUE 'EVENT_CONTENT_PROPOSE';
ALTER TYPE "McpAdminCapability" ADD VALUE 'LOCATION_PROPOSE';
ALTER TYPE "McpAdminCapability" ADD VALUE 'PREPARATION_PROPOSE';
ALTER TYPE "McpAdminCapability" ADD VALUE 'LIVESTREAM_PROPOSE';

CREATE TYPE "McpProposalOperation" AS ENUM ('EVENT_DESCRIPTION', 'EVENT_CONTENT', 'EVENT_LOCATION', 'EVENT_PREPARATION', 'EVENT_LIVESTREAM');
ALTER TABLE "mcp_admin_proposals"
  ADD COLUMN "operation" "McpProposalOperation" NOT NULL DEFAULT 'EVENT_DESCRIPTION',
  ADD COLUMN "beforeValues" JSONB,
  ADD COLUMN "afterValues" JSONB;
ALTER TABLE "mcp_admin_proposals" ADD CONSTRAINT "mcp_admin_proposals_operation_payload"
  CHECK ("operation" = 'EVENT_DESCRIPTION' OR
    ("beforeValues" IS NOT NULL AND "afterValues" IS NOT NULL AND jsonb_typeof("beforeValues") = 'object' AND jsonb_typeof("afterValues") = 'object'));
ALTER TABLE "mcp_admin_delegations" DROP CONSTRAINT "mcp_admin_delegations_capabilities";
ALTER TABLE "mcp_admin_delegations" ADD CONSTRAINT "mcp_admin_delegations_capabilities"
  CHECK (cardinality("capabilities") BETWEEN 1 AND 12);
