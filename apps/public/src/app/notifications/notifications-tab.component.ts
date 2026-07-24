import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NovuInboxComponent } from '@cacic-fct/shared-notifications-angular';

@Component({
  selector: 'app-notifications-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NovuInboxComponent],
  template: ` <lib-novu-inbox title="Notificações" /> `,
})
export class NotificationsTabComponent {}
