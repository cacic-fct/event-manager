import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Permission } from '@cacic-fct/shared-permissions';
import { EventType } from '@cacic-fct/event-manager-admin-contracts';
import { TwemojiComponent } from '../emoji/twemoji.component';
import { isFrozenEvent } from '../resource-state/frozen-resource';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { AttendancesService } from './attendances.service';
import { PermissionsService } from '../permissions/permissions.service';
import { EventFilterPanelComponent } from '../event-filters/event-filter-panel.component';

@Component({
  selector: 'app-workspace-event-attendances-subtab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatSelectModule,
    MatTooltipModule,
    TwemojiComponent,
    EventFilterPanelComponent,
  ],
  templateUrl: './event-attendances.component.html',
  styleUrls: [
    '../app-shell/layout/page-layout.shared.scss',
    '../app-shell/layout/lists-layout.shared.scss',
    '../app-shell/layout/entity-permissions.shared.scss',
    '../app-shell/layout/forms-feedback.shared.scss',
    './attendance-subtabs.shared.scss',
  ],
})
export class EventAttendancesComponent implements OnInit {
  readonly workspace = inject(AttendancesService);
  protected readonly auditLog = inject(AuditLogService);
  protected readonly permissions = inject(PermissionsService);
  protected readonly Permission = Permission;

  ngOnInit(): void {
    if (this.workspace.attendanceEventResults().length === 0) {
      void this.workspace.searchAttendanceEvents();
    }
  }

  protected describeEventType(type: EventType | null | undefined): string {
    if (type === 'MINICURSO') {
      return 'Minicurso';
    }

    if (type === 'PALESTRA') {
      return 'Palestra';
    }

    return 'Outro';
  }

  protected canEditSelectedEventAttendances(): boolean {
    const event = this.workspace.selectedAttendanceEvent();
    return (
      this.permissions.hasAny([
        Permission.EventAttendance.Collect,
        Permission.EventAttendance.Import,
        Permission.EventAttendance.Update,
      ]) &&
      Boolean(event) &&
      (!isFrozenEvent(event) || this.permissions.has(Permission.Frozen.Update))
    );
  }

  protected isSelectedAttendanceEventFrozen(): boolean {
    return isFrozenEvent(this.workspace.selectedAttendanceEvent());
  }

  protected isSelectedAttendanceEventLocked(): boolean {
    return this.isSelectedAttendanceEventFrozen() && !this.permissions.has(Permission.Frozen.Update);
  }

  protected canDeleteSelectedEventAttendances(): boolean {
    const event = this.workspace.selectedAttendanceEvent();
    return (
      this.permissions.canDelete(Permission.EventAttendance.Delete) &&
      Boolean(event) &&
      (!isFrozenEvent(event) || this.permissions.has(Permission.Frozen.Delete))
    );
  }
}
