import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { Permission } from '@cacic-fct/shared-permissions';
import { firstValueFrom } from 'rxjs';
import { ReceiptValidationApiService } from '../../../graphql/receipt-validation-api.service';
import { WorkspaceSubscriptionsService } from '../../data-access/subscriptions/subscriptions.service';
import { WorkspacePermissionsService } from '../../data-access/permissions/permissions.service';
import { EventSubscriptionsComponent } from './event-subscriptions.component';
import { MajorEventSubscriptionsComponent } from './major-event-subscriptions.component';

@Component({
  selector: 'app-workspace-subscriptions-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTabsModule, EventSubscriptionsComponent, MajorEventSubscriptionsComponent],
  templateUrl: './subscriptions-page.component.html',
  styleUrls: [
    '../../shared/styles/page-layout.shared.scss',
    '../../shared/styles/lists-layout.shared.scss',
    '../../shared/styles/entity-permissions.shared.scss',
    '../../shared/styles/forms-feedback.shared.scss',
    './subscription-subtabs.shared.scss',
  ],
})
export class SubscriptionsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly workspace = inject(WorkspaceSubscriptionsService);
  protected readonly permissions = inject(WorkspacePermissionsService);
  private readonly receiptValidationApi = inject(ReceiptValidationApiService);

  protected readonly selectedTabIndex = signal(0);
  protected readonly selectedMajorEventPendingReceiptsCount = signal(0);

  constructor() {
    void this.initializeReceiptValidation();

    this.workspace.majorEventForm.controls.majorEventId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      void this.loadSelectedMajorEventPendingReceiptCount();
    });

    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const eventId = params.get('eventId');
      const majorEventId = params.get('majorEventId');

      if (eventId) {
        this.selectedTabIndex.set(0);
        void this.workspace.selectEventById(eventId);
        return;
      }

      if (majorEventId) {
        this.selectedTabIndex.set(1);
        void this.workspace.selectMajorEventById(majorEventId);
        return;
      }

      this.selectedTabIndex.set(0);
    });
  }

  private async initializeReceiptValidation(): Promise<void> {
    await this.permissions.evaluateWorkspacePermissions();
    if (!this.permissions.has(Permission.Receipt.Read)) {
      this.selectedMajorEventPendingReceiptsCount.set(0);
      return;
    }

    await this.loadSelectedMajorEventPendingReceiptCount();
  }

  private async loadSelectedMajorEventPendingReceiptCount(): Promise<void> {
    if (!this.permissions.has(Permission.Receipt.Read)) {
      this.selectedMajorEventPendingReceiptsCount.set(0);
      return;
    }

    const majorEventId = this.workspace.majorEventForm.controls.majorEventId.value;
    if (!majorEventId) {
      this.selectedMajorEventPendingReceiptsCount.set(0);
      return;
    }

    const queue = await firstValueFrom(this.receiptValidationApi.getQueue(majorEventId));
    this.selectedMajorEventPendingReceiptsCount.set(queue.pendingCount);
  }

  protected onSelectedTabIndexChange(index: number): void {
    this.selectedTabIndex.set(index);
    if (index === 0) {
      void this.router.navigate(['/subscriptions']);
      return;
    }

    const majorEventId = this.workspace.majorEventForm.controls.majorEventId.value;
    void this.router.navigate(majorEventId ? ['/subscriptions/major-event', majorEventId] : ['/subscriptions']);
  }
}
