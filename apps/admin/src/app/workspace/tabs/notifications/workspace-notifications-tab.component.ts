import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NovuInboxComponent } from '@cacic-fct/shared-notifications-angular';

@Component({
  selector: 'app-workspace-notifications-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NovuInboxComponent],
  template: ` <lib-novu-inbox title="" /> `,
})
export class WorkspaceNotificationsTabComponent {}
