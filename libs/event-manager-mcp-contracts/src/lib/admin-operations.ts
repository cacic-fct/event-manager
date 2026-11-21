export type AdminMcpScope =
  | { mode: 'ALL_AUTHORIZED' }
  | { mode: 'RESOURCE'; kind: 'EVENT' | 'EVENT_GROUP' | 'MAJOR_EVENT'; id: string };
export interface AdminMcpOperationInfo {
  field: string;
  tool: string;
  kind: 'query' | 'mutation';
  domain: string;
  label: string;
  description: string;
  personalData: boolean;
  requiresAllAuthorized?: boolean;
  inputSchema: Record<string, unknown>;
}
export interface AdminMcpDelegationInput {
  clientId: string;
  operations: string[];
  scope: AdminMcpScope;
  personalData: boolean;
  expiresAt: string;
  maxProposals: number;
}
export interface AdminMcpDelegation extends AdminMcpDelegationInput {
  id: string;
  createdAt: string;
  revokedAt: string | null;
}
export type AdminMcpCommandState = 'PENDING' | 'APPLYING' | 'APPLIED' | 'REJECTED' | 'UNCERTAIN';
export interface AdminMcpCommand {
  targets?: { kind: string; id: string; label: string | null }[];
  id: string;
  delegationId: string;
  operation: string;
  operationLabel: string;
  domain: string;
  clientId: string;
  state: AdminMcpCommandState;
  arguments: Record<string, unknown>;
  inputSchema: Record<string, unknown>;
  effects: string;
  fingerprint: string;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  approvedByName: string | null;
  canApprove: boolean;
  unavailableReason: string | null;
}
export interface AdminMcpCommandPage {
  items: AdminMcpCommand[];
  hasMore: boolean;
}
export interface AdminMcpCommandReview {
  arguments: Record<string, unknown>;
  expectedFingerprint: string;
}
export interface AdminMcpCommandPreview extends AdminMcpCommandReview {
  proposalId: string;
  operation: string;
  effects: string;
  token: string;
}
export interface AdminMcpCommandDecision {
  decision: 'APPROVE' | 'REJECT';
  expectedFingerprint: string;
  review?: AdminMcpCommandPreview;
}

export interface AdminMcpCommandDecisionResult {
  success: true;
  state: AdminMcpCommandState;
}
