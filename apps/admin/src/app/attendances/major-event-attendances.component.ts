import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MajorEventUserAttendance } from '@cacic-fct/event-manager-admin-contracts';
import { Permission } from '@cacic-fct/shared-permissions';
import { PermissionsService } from '../permissions/permissions.service';
import { AttendancesService } from './attendances.service';
import { ParticipantSummaryComponent } from '../shared/participant-summary.component';
import { WorkspaceRecordComponent } from '../shared/workspace-record.component';

@Component({
  selector: 'app-workspace-major-event-attendances-subtab',
  imports: [
    TwemojiComponent,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatListModule,
    MatInputModule,
    MatTooltipModule,
    ParticipantSummaryComponent,
    WorkspaceRecordComponent,
  ],
  templateUrl: './major-event-attendances.component.html',
  styleUrls: [
    '../app-shell/layout/page-layout.shared.scss',
    '../app-shell/layout/lists-layout.shared.scss',
    './attendance-subtabs.shared.scss',
  ],
})
export class MajorEventAttendancesComponent {
  readonly workspace = inject(AttendancesService);
  protected readonly permissions = inject(PermissionsService);
  protected readonly Permission = Permission;

  protected attendedEventCount(attendance: MajorEventUserAttendance): number {
    return attendance.attendances.filter((eventAttendance) => eventAttendance.attended).length;
  }

}
