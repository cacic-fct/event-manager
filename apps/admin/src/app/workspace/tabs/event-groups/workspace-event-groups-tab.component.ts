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
import { MatTooltipModule } from '@angular/material/tooltip';
import { TwemojiComponent } from '../../../shared/components/twemoji.component';
import { EventGroup } from '../../../graphql/models';
import { isFrozenEventGroup } from '../../../shared/frozen-resource';
import { WorkspaceEventGroupsService } from '../../../shared/services/workspace-event-groups.service';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-workspace-event-groups-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatTooltipModule,
    TwemojiComponent,
    DatePipe,
  ],
  templateUrl: './workspace-event-groups-tab.component.html',
  styleUrl: '../workspace-tab.shared.scss',
})
export class WorkspaceEventGroupsTabComponent {
  readonly workspace = inject(WorkspaceEventGroupsService);
  private readonly route = inject(ActivatedRoute);
  protected readonly permissions = inject(WorkspacePermissionsService);

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const groupId = params.get('groupId');
      if (groupId) {
        void this.workspace.pickEventGroupById(groupId);
        return;
      }

      if (this.workspace.selectedEventGroup()) {
        this.workspace.startNewEventGroup();
      }
    });
  }

  protected canEditGroup(group: EventGroup | null | undefined): boolean {
    return (
      this.permissions.canEdit('event#edit') &&
      (!group || !this.isGroupFrozen(group) || this.permissions.has('frozen#edit'))
    );
  }

  protected canDeleteGroup(group: EventGroup): boolean {
    return this.permissions.canDelete('event#delete') && (!this.isGroupFrozen(group) || this.permissions.has('frozen#delete'));
  }

  protected canEditSelectedGroupEvents(): boolean {
    return this.canEditGroup(this.workspace.selectedEventGroup());
  }

  private isGroupFrozen(group: EventGroup): boolean {
    const events = this.workspace.eventSummaries().filter((eventItem) => eventItem.eventGroupId === group.id);
    return isFrozenEventGroup(group, events);
  }
}
