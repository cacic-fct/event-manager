import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { Permission } from '@cacic-fct/shared-permissions';
import { EventType } from '../../../graphql/models';
import { TwemojiComponent } from '../../../shared/components/twemoji.component';
import { isFrozenEvent } from '../../../shared/frozen-resource';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';
import { WorkspaceSubscriptionsService } from '../../../shared/services/workspace-subscriptions.service';
import { EventFilterPanelComponent } from '../shared/event-filter-panel.component';

@Component({
  selector: 'app-workspace-event-subscriptions-subtab',
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
  templateUrl: './workspace-event-subscriptions-subtab.component.html',
  styleUrls: ['../workspace-tab.shared.scss', './workspace-subscription-subtabs.shared.scss'],
})
export class WorkspaceEventSubscriptionsSubtabComponent implements OnInit {
  readonly workspace = inject(WorkspaceSubscriptionsService);
  protected readonly permissions = inject(WorkspacePermissionsService);
  protected readonly Permission = Permission;

  ngOnInit(): void {
    if (this.workspace.eventResults().length === 0) {
      void this.workspace.searchEvents();
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

  protected canEditSelectedEventSubscriptions(): boolean {
    const event = this.workspace.selectedEvent();
    return (
      this.permissions.canEdit(Permission.Subscription.Create) &&
      Boolean(event) &&
      (!isFrozenEvent(event) || this.permissions.has(Permission.Frozen.Update))
    );
  }
}
