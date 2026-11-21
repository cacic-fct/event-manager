import type { McpEventReviewFieldValue, McpEventReviewSelection } from './event-review';

export const MCP_ADMIN_CAPABILITIES = [
  'EVENT_READ',
  'ATTENDANCE_READ',
  'DESCRIPTION_PROPOSE',
  'PREPARATION_READ',
  'MATERIALS_READ',
  'SUBSCRIPTIONS_READ',
  'FORMS_READ',
  'CONTENT_REVIEWS_READ',
  'EVENT_CONTENT_PROPOSE',
  'LOCATION_PROPOSE',
  'PREPARATION_PROPOSE',
  'LIVESTREAM_PROPOSE',
] as const;

export const MCP_PROPOSAL_OPERATIONS = [
  'EVENT_DESCRIPTION',
  'EVENT_CONTENT',
  'EVENT_LOCATION',
  'EVENT_PREPARATION',
  'EVENT_LIVESTREAM',
] as const;
export type McpProposalOperation = (typeof MCP_PROPOSAL_OPERATIONS)[number];
export interface McpProposalChange {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

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
  operation?: McpProposalOperation;
  operationLabel?: string;
  changes?: McpProposalChange[];
  reviewFields?: McpEventReviewFieldValue[];
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
  expectedOperation?: McpProposalOperation;
  decision: 'APPROVE' | 'REJECT';
  expectedUpdatedAt: string;
  review?: { selections: McpEventReviewSelection[]; token: string };
}
