import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Permission } from '@cacic-fct/shared-permissions';
import { getSubscriptionStatusLabel } from '@cacic-fct/shared-utils';
import { TwemojiComponent } from '../emoji/twemoji.component';
import { isFrozenMajorEvent } from '../resource-state/frozen-resource';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { AttendancesService } from './attendances.service';
import { PermissionsService } from '../permissions/permissions.service';

@Component({
  selector: 'app-workspace-major-event-attendances-subtab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatSelectModule,
    MatTooltipModule,
    TwemojiComponent,
  ],
  templateUrl: './major-event-attendances.component.html',
  styleUrls: [
    '../app-shell/layout/page-layout.shared.scss',
    '../app-shell/layout/lists-layout.shared.scss',
    '../app-shell/layout/entity-permissions.shared.scss',
    '../app-shell/layout/forms-feedback.shared.scss',
    './attendance-subtabs.shared.scss',
  ],
})
export class MajorEventAttendancesComponent {
  readonly workspace = inject(AttendancesService);
  protected readonly auditLog = inject(AuditLogService);
  protected readonly permissions = inject(PermissionsService);

  protected readonly statuses = [
    'WAITING_RECEIPT_UPLOAD',
    'RECEIPT_UNDER_REVIEW',
    'REJECTED_INVALID_RECEIPT',
    'REJECTED_NO_SLOTS',
    'REJECTED_SCHEDULE_CONFLICT',
    'REJECTED_GENERIC',
    'CONFIRMED',
    'CANCELED',
  ] as const;

  protected statusLabel(status: string | null | undefined): string {
    return status ? getSubscriptionStatusLabel(status) : '-';
  }

  protected canEditSelectedMajorEventAttendances(): boolean {
    const majorEvent = this.workspace
      .majorEvents()
      .find((item) => item.id === this.workspace.majorEventAttendanceForm.controls.majorEventId.value);
    return (
      this.permissions.hasAny([
        Permission.EventAttendance.Collect,
        Permission.EventAttendance.Import,
        Permission.EventAttendance.Update,
      ]) &&
      Boolean(majorEvent) &&
      (!isFrozenMajorEvent(majorEvent) || this.permissions.has(Permission.Frozen.Update))
    );
  }
}
