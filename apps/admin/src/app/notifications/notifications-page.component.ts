import { Component } from '@angular/core';
import { NovuInboxComponent } from '@cacic-fct/shared-notifications-angular/inbox';

@Component({
  selector: 'app-workspace-notifications-tab',
  imports: [NovuInboxComponent],
  template: ` <lib-novu-inbox title="Caixa de entrada" [markReadOnOpen]="false" [showUnreadFilter]="true" /> `,
  styleUrl: './notifications-page.component.scss',
})
export class NotificationsPageComponent {}
