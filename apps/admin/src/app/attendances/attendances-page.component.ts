import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { AttendancesService } from './attendances.service';
import { EventAttendancesComponent } from './event-attendances.component';
import { MajorEventAttendancesComponent } from './major-event-attendances.component';

@Component({
  selector: 'app-workspace-attendances-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTabsModule, EventAttendancesComponent, MajorEventAttendancesComponent],
  templateUrl: './attendances-page.component.html',
  styleUrls: [
    '../app-shell/layout/page-layout.shared.scss',
    '../app-shell/layout/lists-layout.shared.scss',
    '../app-shell/layout/entity-permissions.shared.scss',
    '../app-shell/layout/forms-feedback.shared.scss',
    './attendances-page.component.scss',
  ],
})
export class AttendancesPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly workspace = inject(AttendancesService);

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

    const majorEventId = this.workspace.majorEventAttendanceForm.controls.majorEventId.value;
    void this.router.navigate(majorEventId ? ['/attendances/major-event', majorEventId] : ['/attendances']);
  }
}
