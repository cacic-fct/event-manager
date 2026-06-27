import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Permission } from '@cacic-fct/shared-permissions';
import { getSubscriptionStatusLabel } from '@cacic-fct/shared-utils';
import { TwemojiComponent } from '../../../shared/components/twemoji.component';
import { WorkspaceMajorEventSubscription } from '@cacic-fct/event-manager-admin-contracts';
import { isFrozenMajorEvent } from '../../../shared/frozen-resource';
import { WorkspaceAuditLogService } from '../../../shared/services/workspace-audit-log.service';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';
import { WorkspaceSubscriptionsService } from '../../../shared/services/workspace-subscriptions.service';

@Component({
  selector: 'app-workspace-major-event-subscriptions-subtab',
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
    RouterLink,
    TwemojiComponent,
  ],
  templateUrl: './workspace-major-event-subscriptions-subtab.component.html',
  styleUrls: ['../workspace-tab.shared.scss', './workspace-subscription-subtabs.shared.scss'],
})
export class WorkspaceMajorEventSubscriptionsSubtabComponent {
  readonly pendingReceiptsCount = input.required<number>();
  readonly workspace = inject(WorkspaceSubscriptionsService);
  protected readonly auditLog = inject(WorkspaceAuditLogService);
  protected readonly permissions = inject(WorkspacePermissionsService);
  protected readonly Permission = Permission;

  protected readonly statuses = [
    'WAITING_RECEIPT_UPLOAD',
    'RECEIPT_UNDER_REVIEW',
    'REJECTED_INVALID_RECEIPT',
    'REJECTED_NO_SLOTS',
    'REJECTED_SCHEDULE_CONFLICT',
    'REJECTED_GENERIC',
    'CONFIRMED',
    'CANCELED',
  ] as const;

  protected hasSubscribedLecturer(subscription: WorkspaceMajorEventSubscription): boolean {
    return subscription.events.some((eventItem) => eventItem.isLecturerSubscription && eventItem.subscribed);
  }

  protected hasSubscribedLecturerInSelection(): boolean {
    return this.workspace
      .selectedMajorEventEvents()
      .some((eventItem) => eventItem.isLecturerSubscription && eventItem.subscribed);
  }

  protected isSelectedMajorEventFrozen(): boolean {
    return isFrozenMajorEvent(this.workspace.selectedMajorEvent());
  }

  protected isSelectedMajorEventLocked(): boolean {
    return this.isSelectedMajorEventFrozen() && !this.permissions.has(Permission.Frozen.Update);
  }

  protected statusLabel(status: string): string {
    return getSubscriptionStatusLabel(status);
  }

  protected receiptValidationLink(): string[] {
    const majorEventId = this.workspace.majorEventForm.controls.majorEventId.value;
    return majorEventId
      ? ['/subscriptions/major-event', majorEventId, 'validate-receipts']
      : ['/subscriptions'];
  }

  protected canEditSelectedMajorEventSubscriptions(): boolean {
    const majorEvent = this.workspace
      .majorEvents()
      .find((item) => item.id === this.workspace.majorEventForm.controls.majorEventId.value);
    return (
      this.permissions.hasAny([
        Permission.Subscription.Create,
        Permission.Subscription.Update,
        Permission.Subscription.Import,
      ]) &&
      Boolean(majorEvent) &&
      (!isFrozenMajorEvent(majorEvent) || this.permissions.has(Permission.Frozen.Update))
    );
  }

  protected canValidateSelectedMajorEventReceipts(): boolean {
    const majorEvent = this.workspace
      .majorEvents()
      .find((item) => item.id === this.workspace.majorEventForm.controls.majorEventId.value);
    return (
      this.permissions.hasAny([Permission.Receipt.Approve, Permission.Receipt.Reject, Permission.Receipt.Undo]) &&
      Boolean(majorEvent) &&
      (!isFrozenMajorEvent(majorEvent) || this.permissions.has(Permission.Frozen.Update))
    );
  }
}
