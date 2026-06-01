import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TwemojiComponent } from '../../../shared/components/twemoji.component';
import { MajorEvent } from '../../../graphql/models';
import { isFrozenMajorEvent } from '../../../shared/frozen-resource';
import { WorkspaceMajorEventsService } from '../../../shared/services/workspace-major-events.service';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';

@Component({
  selector: 'app-workspace-major-events-tab',
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
    MatRadioModule,
    MatSelectModule,
    MatTooltipModule,
    TwemojiComponent,
  ],
  templateUrl: './workspace-major-events-tab.component.html',
  styleUrl: '../workspace-tab.shared.scss',
})
export class WorkspaceMajorEventsTabComponent {
  readonly workspace = inject(WorkspaceMajorEventsService);
  private readonly route = inject(ActivatedRoute);
  protected readonly permissions = inject(WorkspacePermissionsService);

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const majorEventId = params.get('majorEventId');
      if (majorEventId) {
        void this.workspace.pickMajorEventById(majorEventId);
        return;
      }

      if (this.workspace.selectedMajorEvent()) {
        this.workspace.resetMajorEventForm();
      }
    });
  }

  protected canEditMajorEvent(majorEvent: MajorEvent | null | undefined): boolean {
    return (
      this.permissions.canEdit('major-event#edit') &&
      (!majorEvent || !isFrozenMajorEvent(majorEvent) || this.permissions.has('frozen#edit'))
    );
  }

  protected canDeleteMajorEvent(majorEvent: MajorEvent): boolean {
    return (
      this.permissions.canDelete('major-event#delete') &&
      (!isFrozenMajorEvent(majorEvent) || this.permissions.has('frozen#delete'))
    );
  }

  protected canEditSelectedMajorEventEvents(): boolean {
    const selectedMajorEvent = this.workspace.selectedMajorEvent();
    return (
      this.permissions.canEdit('event#edit') &&
      (!selectedMajorEvent || !isFrozenMajorEvent(selectedMajorEvent) || this.permissions.has('frozen#edit'))
    );
  }
}
