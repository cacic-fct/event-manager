import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { WorkspaceEventAttendancesSubtabComponent } from './workspace-event-attendances-subtab.component';
import { WorkspaceMajorEventAttendancesSubtabComponent } from './workspace-major-event-attendances-subtab.component';

@Component({
  selector: 'app-workspace-attendances-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatTabsModule,
    WorkspaceEventAttendancesSubtabComponent,
    WorkspaceMajorEventAttendancesSubtabComponent,
  ],
  templateUrl: './workspace-attendances-tab.component.html',
  styleUrls: [
    '../workspace-tab.shared.scss',
    './workspace-attendances-tab.component.scss',
  ],
})
export class WorkspaceAttendancesTabComponent {}
