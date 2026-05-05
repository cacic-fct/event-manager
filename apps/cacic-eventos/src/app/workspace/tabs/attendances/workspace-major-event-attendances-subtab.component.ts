import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { TwemojiComponent } from '../../../shared/components/twemoji.component';
import { WorkspaceAttendancesService } from '../../../shared/services/workspace-attendances.service';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';

@Component({
  selector: 'app-workspace-major-event-attendances-subtab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatListModule,
    MatSelectModule,
    TwemojiComponent,
  ],
  templateUrl: './workspace-major-event-attendances-subtab.component.html',
  styleUrls: [
    '../workspace-tab.shared.scss',
    './workspace-attendance-subtabs.shared.scss',
  ],
})
export class WorkspaceMajorEventAttendancesSubtabComponent {
  readonly workspace = inject(WorkspaceAttendancesService);
  protected readonly permissions = inject(WorkspacePermissionsService);
}
