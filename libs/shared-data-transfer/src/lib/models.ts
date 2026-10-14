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

export interface TransferPreview {
  items: TransferItem[];
  summary: TransferSummary;
  planHash: string;
  canApply: boolean;
  allocation?: TransferAllocation;
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
  includeChildSubscriptions?: boolean;
  includeChildAttendances?: boolean;
}

export interface TransferPreviewRequest {
  document: unknown;
  scope?: TransferTarget;
}

export interface TransferApplyRequest extends TransferPreviewRequest {
  planHash: string;
  allowPartial: boolean;
  allocationToken?: string;
}
