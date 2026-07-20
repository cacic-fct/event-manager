import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Permission } from '@cacic-fct/shared-permissions';
import { type AuditLogEntityType, type EventType, type WorkspaceEventSubscription } from '@cacic-fct/event-manager-admin-contracts';
import { TwemojiComponent } from '../../../shared/components/twemoji.component';
import { isFrozenEvent } from '../../../shared/frozen-resource';
import { AuditLogService } from '../audit-logs/data-access/audit-log.service';
import { PermissionsService } from '../permissions/data-access/permissions.service';
import { SubscriptionsService } from './data-access/subscriptions.service';
import { EventFilterPanelComponent } from '../../shared/components/filters/event-filter-panel.component';

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
    MatTooltipModule,
    TwemojiComponent,
    EventFilterPanelComponent,
  ],
  templateUrl: './event-subscriptions.component.html',
  styleUrls: [
    '../../shared/styles/page-layout.shared.scss',
    '../../shared/styles/lists-layout.shared.scss',
    '../../shared/styles/entity-permissions.shared.scss',
    '../../shared/styles/forms-feedback.shared.scss',
    './subscription-subtabs.shared.scss',
  ],
})
export class EventSubscriptionsComponent implements OnInit {
  readonly workspace = inject(SubscriptionsService);
  protected readonly auditLog = inject(AuditLogService);
  protected readonly permissions = inject(PermissionsService);
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

  protected subscriptionAuditEntityType(subscription: WorkspaceEventSubscription): AuditLogEntityType {
    if (subscription.eventGroupSubscriptionId) {
      return 'EVENT_GROUP_SUBSCRIPTION';
    }

    if (subscription.majorEventSubscriptionId) {
      return 'MAJOR_EVENT_SUBSCRIPTION';
    }

    return 'EVENT_SUBSCRIPTION';
  }

  protected subscriptionAuditEntityId(subscription: WorkspaceEventSubscription): string {
    return subscription.eventGroupSubscriptionId ?? subscription.majorEventSubscriptionId ?? subscription.id;
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
