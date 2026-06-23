import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { type AuditLogEntityType } from '../../graphql/models';
import { AuditLogDialogComponent } from '../../workspace/dialogs/audit-log-dialog.component';

@Injectable({ providedIn: 'root' })
export class WorkspaceAuditLogService {
  private readonly dialog = inject(MatDialog);
  private readonly platformId = inject(PLATFORM_ID);

  openHistory(entityType: AuditLogEntityType, entityId: string, entityLabel?: string | null): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.dialog.open(AuditLogDialogComponent, {
      data: {
        entityType,
        entityId,
        entityLabel,
      },
      width: 'min(960px, calc(100vw - 32px))',
      maxHeight: 'calc(100vh - 48px)',
    });
  }

  openEventAttendanceHistory(personId: string, eventId: string, personName?: string | null): void {
    this.openHistory('EVENT_ATTENDANCE', this.compositeEntityId([personId, eventId]), personName);
  }

  private compositeEntityId(parts: readonly string[]): string {
    return parts.map((part) => encodeURIComponent(part)).join(':');
  }
}
