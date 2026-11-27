export const MCP_ADMIN_CAPABILITIES = ['EVENT_READ', 'ATTENDANCE_READ', 'DESCRIPTION_PROPOSE'] as const;

export type McpAdminCapability = (typeof MCP_ADMIN_CAPABILITIES)[number];
export type McpProposalStatus = 'PENDING' | 'APPLIED' | 'REJECTED' | 'EXPIRED' | 'REVOKED' | 'STALE';

export interface McpAdminSettings {
  enabled: boolean;
  proposalsEnabled: boolean;
  resourceUrl: string;
  clients: { id: string; name: string }[];
}

export interface McpDelegationInput {
  clientId: string;
  eventIds: string[];
  capabilities: McpAdminCapability[];
  expiresAt: string;
  maxProposals: number;
}

export interface McpAdminDelegation extends McpDelegationInput {
  id: string;
  createdAt: string;
  revokedAt: string | null;
  events: { id: string; name: string }[];
  proposalCount: number;
}

export interface McpAdminProposal {
  id: string;
  delegationId: string;
  eventId: string;
  eventName: string;
  clientId: string;
  createdAt: string;
  expiresAt: string;
  status: McpProposalStatus;
  descriptionBefore: string | null;
  descriptionAfter: string;
  baseUpdatedAt: string;
  currentUpdatedAt: string;
  currentDescription: string | null;
  publicationState: string;
  approvalEffects: string;
  canApprove: boolean;
  unavailableReason: string | null;
  approvedByName: string | null;
  decidedAt: string | null;
}

export interface McpAdminProposalPage {
  items: McpAdminProposal[];
  hasMore: boolean;
}

export interface McpProposalDecisionInput {
  decision: 'APPROVE' | 'REJECT';
  expectedUpdatedAt: string;
}
