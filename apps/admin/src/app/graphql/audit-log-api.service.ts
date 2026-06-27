import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import {
  AuditLogEntry,
  AuditLogEntityType,
  AuditLogExplorerResult,
  AuditLogExplorerRevertedStatus,
  AuditLogOperation,
  AuditLogRevertMode,
} from './models';

export interface AuditLogEntityHistoryInput {
  entityType: AuditLogEntityType;
  entityId: string;
}

export interface AuditLogRevertInput {
  entryId: string;
  mode: AuditLogRevertMode;
}

export interface AuditLogExplorerInput {
  query?: string;
  actor?: string;
  entity?: string;
  entityType?: AuditLogEntityType;
  operation?: AuditLogOperation;
  dateFrom?: string;
  dateTo?: string;
  revertedStatus?: AuditLogExplorerRevertedStatus;
  skip?: number;
  take?: number;
}

@Injectable({ providedIn: 'root' })
export class AuditLogApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);

  listEntityHistory(input: AuditLogEntityHistoryInput, take = 80) {
    return this.graphqlHttp
      .request<{ auditLogEntries: AuditLogEntry[] }>(
        `query AuditLogEntries($input: AuditLogEntityHistoryInput!, $take: Int) {
          auditLogEntries(input: $input, take: $take) {
            ${AUDIT_LOG_ENTRY_FIELDS}
          }
        }`,
        { input, take },
      )
      .pipe(map((data) => data.auditLogEntries));
  }

  searchExplorer(input: AuditLogExplorerInput) {
    return this.graphqlHttp
      .request<{ auditLogExplorer: AuditLogExplorerResult }>(
        `query AuditLogExplorer($input: AuditLogExplorerInput!) {
          auditLogExplorer(input: $input) {
            total
            skip
            take
            typesenseAvailable
            entries {
              ${AUDIT_LOG_EXPLORER_ENTRY_FIELDS}
            }
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.auditLogExplorer));
  }

  revertEntry(input: AuditLogRevertInput) {
    return this.graphqlHttp
      .request<{ revertAuditLogEntry: AuditLogEntry }>(
        `mutation RevertAuditLogEntry($input: AuditLogRevertInput!) {
          revertAuditLogEntry(input: $input) {
            ${AUDIT_LOG_ENTRY_FIELDS}
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.revertAuditLogEntry));
  }
}

const AUDIT_LOG_ENTRY_FIELDS = `
  id
  entityType
  entityId
  entityLabel
  operation
  summary
  actorId
  actorName
  actorEmail
  actorType
  permission
  eventId
  majorEventId
  eventGroupId
  changes {
    field
    label
    beforeValue
    afterValue
  }
  changedFields
  groupedCount
  firstRecordedAt
  lastRecordedAt
  createdAt
  revertedAt
  revertedById
  revertedByName
  revertedByEntryId
  revertTargetId
  revertMode
  canRevert
`;

const AUDIT_LOG_EXPLORER_ENTRY_FIELDS = `
  ${AUDIT_LOG_ENTRY_FIELDS}
  beforeJson
  afterJson
  metadataJson
`;
