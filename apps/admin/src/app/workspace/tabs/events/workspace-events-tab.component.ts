import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Permission } from '@cacic-fct/shared-permissions';
import { TwemojiComponent } from '../../../shared/components/twemoji.component';
import { Event, EventType } from '../../../graphql/models';
import { WorkspaceEventsService } from '../../../shared/services/workspace-events.service';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';
import { WorkspaceAuditLogService } from '../../../shared/services/workspace-audit-log.service';
import { isFrozenEvent } from '../../../shared/frozen-resource';
import { EventFilterPanelComponent } from '../shared/event-filter-panel.component';

@Component({
  selector: 'app-workspace-events-tab',
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
    MatSelectModule,
    MatTooltipModule,
    TwemojiComponent,
    EventFilterPanelComponent,
  ],
  templateUrl: './workspace-events-tab.component.html',
  styleUrl: '../workspace-tab.shared.scss',
})
export class WorkspaceEventsTabComponent {
  @ViewChild(EventFilterPanelComponent)
  private eventFilterPanel?: EventFilterPanelComponent;
  readonly workspace = inject(WorkspaceEventsService);
  private readonly route = inject(ActivatedRoute);
  protected readonly auditLog = inject(WorkspaceAuditLogService);
  protected readonly permissions = inject(WorkspacePermissionsService);
  protected readonly Permission = Permission;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const eventId = params.get('eventId');
      if (eventId) {
        void this.workspace.selectEventById(eventId);
        return;
      }

      if (this.workspace.selectedEvent()) {
        this.workspace.resetEventForm();
      }
    });
  }

  focusQuickSearch(): void {
    this.eventFilterPanel?.focusQuickSearch();
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

  protected canEditEvent(eventItem: Event | null | undefined): boolean {
    return (
      this.permissions.canEdit(eventItem ? Permission.Event.Update : Permission.Event.Create) &&
      (!eventItem || !isFrozenEvent(eventItem) || this.permissions.has(Permission.Frozen.Update))
    );
  }

  protected canDeleteEvent(eventItem: Event): boolean {
    return (
      this.permissions.canDelete(Permission.Event.Delete) &&
      (!isFrozenEvent(eventItem) || this.permissions.has(Permission.Frozen.Delete))
    );
  }

  protected canEditSelectedEventRelation(
    scope:
      | typeof Permission.EventAttendanceCollector.Create
      | typeof Permission.EventLecturer.Create
      | typeof Permission.Person.Create,
  ): boolean {
    return this.permissions.canEdit(scope) && (!this.workspace.selectedEvent() || this.canEditEvent(this.workspace.selectedEvent()));
  }

  protected canRemoveSelectedEventRelation(
    scope: typeof Permission.EventAttendanceCollector.Delete | typeof Permission.EventLecturer.Delete,
  ): boolean {
    const selectedEvent = this.workspace.selectedEvent();
    if (!selectedEvent) {
      return this.permissions.canDelete(scope);
    }

    const hasResourcePermission = this.permissions.canDelete(scope);
    return hasResourcePermission && (!isFrozenEvent(selectedEvent) || this.permissions.has(Permission.Frozen.Delete));
  }
}
