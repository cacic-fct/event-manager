import { Component } from '@angular/core';
import { NovuInboxComponent } from '@cacic-fct/shared-notifications-angular';

@Component({
  selector: 'app-notifications-tab',
  imports: [NovuInboxComponent],
  template: ` <lib-novu-inbox title="Notificações" /> `,
  styles: `
    :host {
      display: block;
      padding-block-end: var(--app-bottom-toolbar-height, 0px);
    }
  `,
})
export class NotificationsTabComponent {}
