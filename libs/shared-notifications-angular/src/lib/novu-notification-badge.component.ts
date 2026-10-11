import { Component, inject, input } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { NovuNotificationsService } from './novu-notifications.service';

@Component({
  selector: 'lib-novu-notification-badge',
  imports: [MatBadgeModule],
  template: `
    <span
      [matBadge]="notifications.unreadCount()"
      [matBadgeHidden]="notifications.unreadCount() === 0"
      [matBadgeOverlap]="overlap()">
      <ng-content></ng-content>
    </span>
  `,
})
export class NovuNotificationBadgeComponent {
  protected readonly notifications = inject(NovuNotificationsService);
  readonly overlap = input(true);

  constructor() {
    this.notifications.ensureReady();
  }
}
