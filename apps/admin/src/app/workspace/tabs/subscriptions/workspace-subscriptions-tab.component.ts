import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { firstValueFrom } from 'rxjs';
import { ReceiptValidationApiService } from '../../../graphql/receipt-validation-api.service';
import { WorkspaceSubscriptionsService } from '../../../shared/services/workspace-subscriptions.service';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';
import { WorkspaceEventSubscriptionsSubtabComponent } from './workspace-event-subscriptions-subtab.component';
import { WorkspaceMajorEventSubscriptionsSubtabComponent } from './workspace-major-event-subscriptions-subtab.component';

@Component({
  selector: 'app-workspace-subscriptions-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTabsModule, WorkspaceEventSubscriptionsSubtabComponent, WorkspaceMajorEventSubscriptionsSubtabComponent],
  templateUrl: './workspace-subscriptions-tab.component.html',
  styleUrls: ['../workspace-tab.shared.scss', './workspace-subscription-subtabs.shared.scss'],
})
export class WorkspaceSubscriptionsTabComponent {
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
    if (!this.permissions.has('validate-receipt#read')) {
      this.selectedMajorEventPendingReceiptsCount.set(0);
      return;
    }

    await this.loadSelectedMajorEventPendingReceiptCount();
  }

  private async loadSelectedMajorEventPendingReceiptCount(): Promise<void> {
    if (!this.permissions.has('validate-receipt#read')) {
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
