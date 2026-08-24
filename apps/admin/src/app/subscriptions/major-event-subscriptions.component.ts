import { CurrencyPipe, DatePipe } from '@angular/common';
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
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { WorkspaceMajorEventSubscription } from '@cacic-fct/event-manager-admin-contracts';
import { isFrozenMajorEvent } from '../resource-state/frozen-resource';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { PermissionsService } from '../permissions/permissions.service';
import { SubscriptionsService } from './subscriptions.service';
import { PersonSearchComponent } from '../people/person-search/person-search.component';

@Component({
  selector: 'app-workspace-major-event-subscriptions-subtab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
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
    PersonSearchComponent,
  ],
  templateUrl: './major-event-subscriptions.component.html',
  styleUrls: [
    '../app-shell/layout/page-layout.shared.scss',
    '../app-shell/layout/lists-layout.shared.scss',
    '../app-shell/layout/entity-permissions.shared.scss',
    '../app-shell/layout/forms-feedback.shared.scss',
    './subscription-subtabs.shared.scss',
  ],
})
export class MajorEventSubscriptionsComponent {
  readonly pendingReceiptsCount = input.required<number>();
  readonly workspace = inject(SubscriptionsService);
  protected readonly auditLog = inject(AuditLogService);
  protected readonly permissions = inject(PermissionsService);
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
    return (
      {
        PENDING: 'Aguardando análise',
        APPROVED: 'Aprovada',
        CHANGES_REQUESTED: 'Ajustes solicitados',
        WAITING_PAYMENT: 'Aguardando pagamento',
        ACTIVE: 'Participação ativa',
        REJECTED: 'Não aprovada',
        SUSPENDED: 'Suspensa',
        WITHDRAWN: 'Retirada',
      }[status] ?? getSubscriptionStatusLabel(status)
    );
  }

  protected sportsPaymentStatusLabel(status: string): string {
    return (
      {
        NOT_REQUIRED: 'Pagamento não exigido',
        NOT_AVAILABLE: 'Pagamento indisponível',
        WAITING_APPROVAL: 'Aguardando aprovação',
        WAITING_PAYMENT: 'Aguardando pagamento',
        UNDER_REVIEW: 'Pagamento em análise',
        PAID: 'Pagamento confirmado',
        REJECTED: 'Pagamento rejeitado',
      }[status] ?? status
    );
  }

  protected sportsParticipantSourceLabel(source: string): string {
    return (
      {
        ADMIN: 'Adicionada pela administração',
        TEAM_ASSIGNMENT: 'Adicionada por equipe',
        SELF_SUBSCRIPTION: 'Inscrição da própria pessoa',
      }[source] ?? source
    );
  }

  protected receiptValidationLink(): string[] {
    const majorEventId = this.workspace.majorEventForm.controls.majorEventId.value;
    return majorEventId ? ['/subscriptions/major-event', majorEventId, 'validate-receipts'] : ['/subscriptions'];
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
