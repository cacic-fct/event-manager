import type { TransferDocument, TransferResourceKind, ResolvedTransferDocument } from './schema';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface TransferTarget {
  kind: 'event' | 'group' | 'major-event';
  id: string;
}

export interface TransferChange {
  field: string;
  before: JsonValue;
  after: JsonValue;
}

export interface TransferIssue {
  kind?: TransferResourceKind;
  id?: string;
  path?: string;
  message: string;
}

export interface TransferItem {
  kind: TransferResourceKind;
  id: string;
  key?: string;
  /** Safe display name, supplied only after the target's read authorization succeeds. */
  label?: string;
  action: 'create' | 'update' | 'unchanged' | 'skip';
  status: 'ready' | 'blocked' | 'applied' | 'unchanged';
  message: string;
  changes: TransferChange[];
}

export interface TransferSummary {
  create: number;
  update: number;
  unchanged: number;
  skip: number;
}

export interface TransferPersonData {
  name?: string;
  academicId?: string;
  identityDocument?: string;
  email?: string;
  phone?: string;
}

/** An explicit choice made after the server has checked the source identifiers. */
export type TransferPersonDecision =
  | { key: string; action: 'skip' }
  | { key: string; action: 'create'; data: TransferPersonData; reviewHash?: string }
  | { key: string; action: 'merge'; personId: string; data: TransferPersonData; reviewHash?: string };

export interface TransferPersonPrompt {
  key: string;
  data: TransferPersonData;
  message: string;
  candidates?: Array<TransferPersonData & { id: string }>;
  canCreate?: boolean;
  canMerge?: boolean;
  reviewHash?: string;
  lockedFields?: Array<keyof TransferPersonData>;
}

export interface TransferPreview {
  items: TransferItem[];
  summary: TransferSummary;
  planHash: string;
  canApply: boolean;
  allocation?: TransferAllocation;
  personPrompts?: TransferPersonPrompt[];
}

export interface TransferAllocation {
  token: string;
  expiresAt: string;
  ids: Record<string, string>;
}

export interface TransferResult extends TransferPreview {
  applied: boolean;
  document?: ResolvedTransferDocument;
  batchId?: string;
  auditEntryId?: string;
  synchronizationPending?: boolean;
}

export interface TransferUndoResult {
  batchId: string;
  auditEntryId: string;
  undone: true;
}

export interface TransferBatchSummary {
  batchId: string;
  auditEntryId: string;
  createdAt: string;
  summary: TransferSummary;
  undone: boolean;
  synchronizationPending: boolean;
}

export interface TransferExport {
  document: TransferDocument;
  issues: TransferIssue[];
}

export interface TransferExportRequest {
  target: TransferTarget;
  includeDescendants: boolean;
  includeConfiguration: boolean;
  includeSubscriptions?: boolean;
  includeAttendances?: boolean;
  includeTickets?: boolean;
  includeChildSubscriptions?: boolean;
  includeChildAttendances?: boolean;
}

export interface TransferPreviewRequest {
  document: unknown;
  scope?: TransferTarget;
  personDecisions?: TransferPersonDecision[];
}

export interface TransferApplyRequest extends TransferPreviewRequest {
  planHash: string;
  allowPartial: boolean;
  allocationToken?: string;
}
