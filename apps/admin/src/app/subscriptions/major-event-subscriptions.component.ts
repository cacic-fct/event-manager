import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Permission } from '@cacic-fct/shared-permissions';
import { adminEventWorkspaceRoute, adminSportsWorkspaceRoute, getSubscriptionStatusLabel } from '@cacic-fct/shared-utils';
import { WorkspaceMajorEventSubscription } from '@cacic-fct/event-manager-admin-contracts';
import { isFrozenMajorEvent } from '../resource-state/frozen-resource';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { PermissionsService } from '../permissions/permissions.service';
import { SubscriptionsService } from './subscriptions.service';
import { PersonSearchComponent } from '../people/person-search/person-search.component';
import { ParticipantSummaryComponent } from '../shared/participant-summary.component';
import { WorkspaceRecordComponent } from '../shared/workspace-record.component';

@Component({
  selector: 'app-workspace-major-event-subscriptions-subtab',
  imports: [
    CurrencyPipe,
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatSelectModule,
    MatTooltipModule,
    RouterLink,
    PersonSearchComponent,
    ParticipantSummaryComponent,
    WorkspaceRecordComponent,
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

  protected sportsWorkspaceRoute(majorEventId: string): string[] {
    return majorEventId
      ? adminSportsWorkspaceRoute({ majorEventId, area: 'reviews' })
      : ['/sports'];
  }

  protected eventSettingsRoute(majorEventId: string): string[] {
    return majorEventId
      ? adminEventWorkspaceRoute({ kind: 'major-event', id: majorEventId, section: 'settings' })
      : ['/event-workspace'];
  }

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
    const majorEvent = this.workspace.selectedMajorEvent();
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
    const majorEvent = this.workspace.selectedMajorEvent();
    return (
      this.permissions.hasAny([Permission.Receipt.Approve, Permission.Receipt.Reject, Permission.Receipt.Undo]) &&
      Boolean(majorEvent) &&
      (!isFrozenMajorEvent(majorEvent) || this.permissions.has(Permission.Frozen.Update))
    );
  }
}
