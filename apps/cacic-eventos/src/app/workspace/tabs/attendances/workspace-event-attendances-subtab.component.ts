import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { EventType } from '../../../graphql/models';
import { TwemojiComponent } from '../../../shared/components/twemoji.component';
import { WorkspaceAttendancesService } from '../../../shared/services/workspace-attendances.service';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';
import { EventFilterPanelComponent } from '../shared/event-filter-panel.component';

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
    TwemojiComponent,
    EventFilterPanelComponent,
  ],
  templateUrl: './workspace-event-attendances-subtab.component.html',
  styleUrls: [
    '../workspace-tab.shared.scss',
    './workspace-attendance-subtabs.shared.scss',
  ],
})
export class WorkspaceEventAttendancesSubtabComponent implements OnInit {
  readonly workspace = inject(WorkspaceAttendancesService);
  protected readonly permissions = inject(WorkspacePermissionsService);

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
}
