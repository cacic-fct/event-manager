import { Component, DestroyRef, OnDestroy, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { EventContextPickerComponent, type EventContextRef } from '../shared/event-context-picker.component';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Permission } from '@cacic-fct/shared-permissions';
import { auditTime, firstValueFrom, Subscription } from 'rxjs';
import { ReceiptValidationApiService } from '../graphql/receipt-validation-api.service';
import { SubscriptionsService } from './subscriptions.service';
import { PermissionsService } from '../permissions/permissions.service';
import { EventSubscriptionsComponent } from './event-subscriptions.component';
import { MajorEventSubscriptionsComponent } from './major-event-subscriptions.component';
import { EventInterestsComponent } from './event-interests.component';
import { ADMIN_SHELL_CONTEXT } from '../shared/admin-shell-context';

@Component({
  selector: 'app-workspace-subscriptions-tab',
  imports: [EventContextPickerComponent, RouterLink, MatButtonModule, MatProgressBarModule, MatIconModule, EventSubscriptionsComponent, MajorEventSubscriptionsComponent, EventInterestsComponent],
  templateUrl: './subscriptions-page.component.html',
  styleUrls: [
    '../app-shell/layout/page-layout.shared.scss',
    '../app-shell/layout/lists-layout.shared.scss',
    '../app-shell/layout/entity-permissions.shared.scss',
    '../app-shell/layout/forms-feedback.shared.scss',
    '../app-shell/layout/workspace-tabs.shared.scss',
    './subscription-subtabs.shared.scss',
  ],
})
export class SubscriptionsPageComponent implements OnDestroy {
  protected readonly inWorkspaceShell = inject(ADMIN_SHELL_CONTEXT, { optional: true }) ?? false;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly workspace = inject(SubscriptionsService);
  protected readonly permissions = inject(PermissionsService);
  private readonly receiptValidationApi = inject(ReceiptValidationApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly context = signal<EventContextRef | null>(null);
  readonly contextLoading = signal(false);
  readonly contextError = signal('');
  protected readonly selectedMajorEventPendingReceiptsCount = signal(0);
  readonly interestsMode = signal(false);
  private majorEventRouteRequest = 0;
  private receiptQueueStream: Subscription | null = null;
  private receiptQueueTargetId: string | null = null;
  private receiptQueueStreamGeneration = 0;
  private receiptQueueRecoveryAttempted = false;
  private receiptQueueRecoveryInFlight = false;
  private receiptQueueTerminal = false;

  constructor() {
    void this.initializeReceiptValidation();

    this.workspace.majorEventForm.controls.majorEventId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncReceiptQueueStream());

    this.destroyRef.onDestroy(() => this.closeReceiptQueueStream());

    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const request = ++this.majorEventRouteRequest;
      const eventId = params.get('eventId');
      const majorEventId = params.get('majorEventId');
      const groupId = params.get('groupId');
      const interests = this.route.snapshot.url.some((segment) => segment.path === 'interests');
      this.interestsMode.set(interests);
      const context: EventContextRef | null = eventId ? { kind: 'event', id: eventId }
        : majorEventId ? { kind: 'major-event', id: majorEventId }
        : groupId && interests ? { kind: 'group', id: groupId } : null;
      this.context.set(context);
      this.contextError.set('');
      this.contextLoading.set(false);
      if (interests) {
        this.workspace.closeLiveUpdates();
        this.closeReceiptQueueStream();
        return;
      }
      if (!context) return;
      if (context.kind === 'event') {
        this.closeReceiptQueueStream();
        this.selectedMajorEventPendingReceiptsCount.set(0);
      }
      this.contextLoading.set(true);
      const load = context.kind === 'event' ? this.workspace.selectEventById(context.id)
        : this.openMajorEventSubscriptionRoute(context.id, params.get('subscriptionId'), request);
      void Promise.resolve(load).catch(() => {
        if (request === this.majorEventRouteRequest) this.contextError.set('Não foi possível abrir as inscrições deste contexto. Escolha outro ou tente novamente.');
      }).finally(() => {
        if (request === this.majorEventRouteRequest) this.contextLoading.set(false);
      });
    });
  }

  selectContext(context: EventContextRef): void {
    void this.router.navigate(['/subscriptions', context.kind, context.id, ...(this.interestsMode() ? ['interests'] : [])]);
  }

  interestsLink(): string[] {
    const context = this.context();
    return context ? ['/subscriptions', context.kind, context.id, 'interests'] : ['/subscriptions', 'interests'];
  }

  subscriptionsLink(): string[] {
    const context = this.context();
    return context && context.kind !== 'group' ? ['/subscriptions', context.kind, context.id] : ['/subscriptions'];
  }

  private async openMajorEventSubscriptionRoute(
    majorEventId: string,
    subscriptionId: string | null,
    routeRequest: number,
  ): Promise<void> {
    if (this.workspace.majorEventForm.controls.majorEventId.value !== majorEventId) {
      await this.workspace.selectMajorEventById(majorEventId, false);
    }
    if (routeRequest !== this.majorEventRouteRequest) {
      return;
    }
    if (subscriptionId && this.workspace.selectedMajorEventSubscription()?.id !== subscriptionId) {
      await this.workspace.selectMajorEventSubscriptionById(majorEventId, subscriptionId);
    } else if (!subscriptionId && routeRequest === this.majorEventRouteRequest) {
      this.workspace.closeMajorEventSubscriptionDetail();
    }
  }

  private async initializeReceiptValidation(): Promise<void> {
    try {
      await this.permissions.evaluateWorkspacePermissions();
    } catch {
      this.closeReceiptQueueStream();
      this.selectedMajorEventPendingReceiptsCount.set(0);
      return;
    }

    if (this.destroyRef.destroyed) {
      return;
    }
    this.syncReceiptQueueStream();
  }

  ngOnDestroy(): void {
    this.workspace.closeLiveUpdates();
  }

  private syncReceiptQueueStream(): void {
    if (this.destroyRef.destroyed) {
      return;
    }

    if (this.context()?.kind === 'event' || this.interestsMode() || !this.permissions.has(Permission.Receipt.Read)) {
      this.closeReceiptQueueStream();
      this.selectedMajorEventPendingReceiptsCount.set(0);
      return;
    }

    const majorEventId = this.workspace.majorEventForm.controls.majorEventId.value;
    if (!majorEventId) {
      this.closeReceiptQueueStream();
      this.selectedMajorEventPendingReceiptsCount.set(0);
      return;
    }

    if (
      this.receiptQueueTargetId === majorEventId &&
      (this.receiptQueueStream || this.receiptQueueRecoveryInFlight || this.receiptQueueTerminal)
    ) {
      return;
    }

    this.closeReceiptQueueStream();
    this.receiptQueueTargetId = majorEventId;
    this.selectedMajorEventPendingReceiptsCount.set(0);
    this.receiptQueueRecoveryAttempted = false;
    this.receiptQueueTerminal = false;
    this.connectReceiptQueueStream(majorEventId, this.receiptQueueStreamGeneration);
  }

  private connectReceiptQueueStream(majorEventId: string, generation: number): void {
    if (!this.isCurrentReceiptQueueStream(majorEventId, generation)) {
      return;
    }

    let terminated = false;
    const stream = this.receiptValidationApi
      .watchQueue(majorEventId)
      .pipe(auditTime(0))
      .subscribe({
        next: (queue) => {
          if (!this.isCurrentReceiptQueueStream(majorEventId, generation)) {
            return;
          }
          this.selectedMajorEventPendingReceiptsCount.set(queue.pendingCount);
          this.receiptQueueRecoveryAttempted = false;
          this.receiptQueueTerminal = false;
        },
        error: () => {
          terminated = true;
          if (!this.isCurrentReceiptQueueStream(majorEventId, generation)) {
            return;
          }
          this.receiptQueueStream = null;
          if (this.receiptQueueRecoveryAttempted) {
            this.receiptQueueTerminal = true;
            return;
          }
          this.receiptQueueRecoveryAttempted = true;
          this.receiptQueueRecoveryInFlight = true;
          void this.recoverReceiptQueueStream(majorEventId, generation);
        },
      });
    if (!terminated) {
      this.receiptQueueStream = stream;
    }
  }

  private async recoverReceiptQueueStream(majorEventId: string, generation: number): Promise<void> {
    try {
      const queue = await firstValueFrom(this.receiptValidationApi.getQueue(majorEventId));
      if (this.isCurrentReceiptQueueStream(majorEventId, generation)) {
        this.selectedMajorEventPendingReceiptsCount.set(queue.pendingCount);
      }
    } catch {
      // Keep the last good badge count visible while the replayable stream reconnects.
    } finally {
      if (this.isCurrentReceiptQueueStream(majorEventId, generation)) {
        this.receiptQueueRecoveryInFlight = false;
        this.connectReceiptQueueStream(majorEventId, generation);
      }
    }
  }

  private isCurrentReceiptQueueStream(majorEventId: string, generation: number): boolean {
    return (
      generation === this.receiptQueueStreamGeneration &&
      this.receiptQueueTargetId === majorEventId &&
      this.workspace.majorEventForm.controls.majorEventId.value === majorEventId
    );
  }

  private closeReceiptQueueStream(): void {
    this.receiptQueueStreamGeneration++;
    this.receiptQueueStream?.unsubscribe();
    this.receiptQueueStream = null;
    this.receiptQueueTargetId = null;
    this.receiptQueueRecoveryAttempted = false;
    this.receiptQueueRecoveryInFlight = false;
    this.receiptQueueTerminal = false;
  }

}
