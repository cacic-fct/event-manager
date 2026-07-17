export type AuditLogEntityType =
  | 'PERSON'
  | 'LECTURER_PROFILE'
  | 'EVENT'
  | 'MAJOR_EVENT'
  | 'EVENT_GROUP'
  | 'PLACE_PRESET'
  | 'PERMISSION_GRANT'
  | 'EVENT_SUBSCRIPTION'
  | 'EVENT_GROUP_SUBSCRIPTION'
  | 'MAJOR_EVENT_SUBSCRIPTION'
  | 'EVENT_ATTENDANCE'
  | 'EVENT_ATTENDANCE_COLLECTOR'
  | 'EVENT_LECTURER'
  | 'EVENT_FORM'
  | 'EVENT_FORM_LINK'
  | 'EVENT_FORM_RESPONSE'
  | 'CERTIFICATE_CONFIG'
  | 'CERTIFICATE'
  | 'MERGE_CANDIDATE'
  | 'RECEIPT_VALIDATION'
  | 'SYSTEM';

export type AuditLogOperation =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'MERGE'
  | 'IMPORT'
  | 'APPROVE'
  | 'REJECT'
  | 'ISSUE'
  | 'REISSUE'
  | 'SCAN'
  | 'UNDO'
  | 'REVERT'
  | 'USER_CREATE';

export type AuditLogActorType = 'USER' | 'SERVICE' | 'SYSTEM';
export type AuditLogRevertMode = 'ENTRY_ONLY' | 'ENTRY_AND_AFTER';
export type AuditLogExplorerRevertedStatus = 'ALL' | 'REVERTED' | 'NOT_REVERTED';

export interface AuditLogChange {
  field: string;
  label: string;
  beforeValue?: string | null;
  afterValue?: string | null;
}

export interface AuditLogEntry {
  id: string;
  entityType: AuditLogEntityType;
  entityId: string;
  entityLabel?: string | null;
  operation: AuditLogOperation;
  summary?: string | null;
  actorId?: string | null;
  actorName: string;
  actorEmail?: string | null;
  actorType: AuditLogActorType;
  permission?: string | null;
  eventId?: string | null;
  majorEventId?: string | null;
  eventGroupId?: string | null;
  changes: AuditLogChange[];
  changedFields: string[];
  groupedCount: number;
  firstRecordedAt: string;
  lastRecordedAt: string;
  createdAt: string;
  revertedAt?: string | null;
  revertedById?: string | null;
  revertedByName?: string | null;
  revertedByEntryId?: string | null;
  revertTargetId?: string | null;
  revertMode?: AuditLogRevertMode | null;
  canRevert: boolean;
}

export interface AuditLogExplorerEntry extends AuditLogEntry {
  beforeJson?: string | null;
  afterJson?: string | null;
  metadataJson?: string | null;
}

export interface AuditLogExplorerResult {
  entries: AuditLogExplorerEntry[];
  total: number;
  skip: number;
  take: number;
  typesenseAvailable: boolean;
}
