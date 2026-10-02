import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Permission } from '@cacic-fct/shared-permissions';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { isFrozenEvent } from '../resource-state/frozen-resource';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { AttendancesService } from './attendances.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PersonSearchComponent } from '../people/person-search/person-search.component';
import { ParticipantSummaryComponent } from '../shared/participant-summary.component';

@Component({
  selector: 'app-workspace-event-attendances-subtab',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatSelectModule,
    MatTooltipModule,
    TwemojiComponent,
    PersonSearchComponent,
    ParticipantSummaryComponent,
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
export class EventAttendancesComponent {
  readonly workspace = inject(AttendancesService);
  protected readonly auditLog = inject(AuditLogService);
  protected readonly permissions = inject(PermissionsService);
  protected readonly Permission = Permission;

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
