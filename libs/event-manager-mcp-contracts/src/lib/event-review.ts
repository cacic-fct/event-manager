import type { McpProposalChange, McpProposalOperation } from './mcp';

export const MCP_EVENT_REVIEW_FIELDS = [
  'name',
  'description',
  'shortDescription',
  'isVirtual',
  'locationName',
  'locationDescription',
  'latitude',
  'longitude',
  'lecturerInformation',
  'collectorInformation',
  'youtubeCode',
  'twitchChannel',
] as const;

export type McpEventReviewField = (typeof MCP_EVENT_REVIEW_FIELDS)[number];
export type McpEventReviewValue = string | number | boolean | null;

export interface McpEventReviewFieldValue {
  field: McpEventReviewField;
  label: string;
  proposedValue: McpEventReviewValue;
}

export type McpEventReviewSelection =
  | { field: 'isVirtual'; value?: boolean }
  | { field: 'latitude' | 'longitude'; value?: number | null }
  | { field: 'name'; value?: string }
  | { field: Exclude<McpEventReviewField, 'isVirtual' | 'latitude' | 'longitude' | 'name'>; value?: string | null };

export interface McpEventReviewInput {
  expectedOperation: McpProposalOperation;
  expectedUpdatedAt: string;
  selections: McpEventReviewSelection[];
}

export interface McpEventReviewPreview {
  token: string;
  changes: McpProposalChange[];
  approvalEffects: string;
}
