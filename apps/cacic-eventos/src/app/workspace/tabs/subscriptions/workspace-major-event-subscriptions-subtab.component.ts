import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { TwemojiComponent } from '../../../shared/components/twemoji.component';
import { WorkspaceMajorEventSubscription } from '../../../graphql/models';
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
    TwemojiComponent,
  ],
  templateUrl: './workspace-major-event-subscriptions-subtab.component.html',
  styleUrls: ['../workspace-tab.shared.scss', './workspace-subscription-subtabs.shared.scss'],
})
export class WorkspaceMajorEventSubscriptionsSubtabComponent {
  readonly workspace = inject(WorkspaceSubscriptionsService);
  protected readonly permissions = inject(WorkspacePermissionsService);

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
}
