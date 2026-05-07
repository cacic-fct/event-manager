import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { WorkspaceAttendancesService } from '../../../shared/services/workspace-attendances.service';
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
export class WorkspaceAttendancesTabComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly workspace = inject(WorkspaceAttendancesService);

  protected readonly selectedTabIndex = signal(0);

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const eventId = params.get('eventId');
      const majorEventId = params.get('majorEventId');

      if (eventId) {
        this.selectedTabIndex.set(0);
        void this.workspace.selectAttendanceEventById(eventId);
        return;
      }

      if (majorEventId) {
        this.selectedTabIndex.set(1);
        void this.workspace.selectMajorEventAttendancesById(majorEventId);
        return;
      }

      this.selectedTabIndex.set(0);
    });
  }

  protected onSelectedTabIndexChange(index: number): void {
    this.selectedTabIndex.set(index);
    if (index === 0) {
      void this.router.navigate(['/attendances']);
      return;
    }

    const majorEventId =
      this.workspace.majorEventAttendanceForm.controls.majorEventId.value;
    void this.router.navigate(
      majorEventId
        ? ['/attendances/major-event', majorEventId]
        : ['/attendances'],
    );
  }
}
