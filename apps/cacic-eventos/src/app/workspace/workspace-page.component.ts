import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '@cacic-eventos/shared-angular';
import { WorkspaceEventsService } from '../shared/services/workspace-events.service';
import { WorkspacePermissionsService } from '../shared/services/workspace-permissions.service';
import { WorkspaceShellService } from '../shared/services/workspace-shell.service';
import { WorkspaceAttendancesTabComponent } from './tabs/attendances/workspace-attendances-tab.component';
import { WorkspaceEventGroupsTabComponent } from './tabs/event-groups/workspace-event-groups-tab.component';
import { WorkspaceEventsTabComponent } from './tabs/events/workspace-events-tab.component';
import { WorkspaceMergeCandidatesTabComponent } from './tabs/merge-candidates/workspace-merge-candidates-tab.component';
import { WorkspaceMajorEventsTabComponent } from './tabs/major-events/workspace-major-events-tab.component';
import { WorkspacePeopleTabComponent } from './tabs/people/workspace-people-tab.component';
import { WorkspaceCertificatesTabComponent } from './tabs/certificates/workspace-certificates-tab.component';

@Component({
  selector: 'app-workspace-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatToolbarModule,
    MatButtonModule,
    MatTabsModule,
    MatCardModule,
    MatProgressSpinnerModule,
    WorkspaceEventsTabComponent,
    WorkspaceMajorEventsTabComponent,
    WorkspaceEventGroupsTabComponent,
    WorkspacePeopleTabComponent,
    WorkspaceMergeCandidatesTabComponent,
    WorkspaceAttendancesTabComponent,
    WorkspaceCertificatesTabComponent,
  ],
  templateUrl: './workspace-page.component.html',
  styleUrl: './workspace-page.component.scss',
})
export class WorkspacePageComponent {
  private readonly authService = inject(AuthService);
  readonly shell = inject(WorkspaceShellService);
  protected readonly permissions = inject(WorkspacePermissionsService);
  private readonly eventsService = inject(WorkspaceEventsService);

  @ViewChild(WorkspaceEventsTabComponent)
  protected eventsTab?: WorkspaceEventsTabComponent;

  protected readonly user = this.authService.user;
  protected readonly activeTabIndex = signal(0);
  protected readonly tabs = this.permissions.tabs;

  constructor() {
    void this.shell.loadInitialData();
    console.log('User permissions:', this.authService.user());
  }

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeyDown(event: KeyboardEvent): void {
    const targetElement = event.target as HTMLElement | null;
    if (
      targetElement &&
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(targetElement.tagName)
    ) {
      return;
    }

    if (
      event.key === '/' &&
      this.activeTabIndex() === 0 &&
      this.permissions.canReadTab(0)
    ) {
      event.preventDefault();
      this.eventsTab?.focusQuickSearch();
      return;
    }

    if (
      event.key.toLowerCase() === 'n' &&
      this.activeTabIndex() === 0 &&
      this.permissions.canEdit('event#edit')
    ) {
      event.preventDefault();
      this.eventsService.resetEventForm();
      return;
    }

    if (
      event.ctrlKey &&
      event.key.toLowerCase() === 's' &&
      this.activeTabIndex() === 0 &&
      this.permissions.canEdit('event#edit')
    ) {
      event.preventDefault();
      void this.eventsService.saveEvent();
    }
  }

  protected async logout(): Promise<void> {
    await this.authService.logout();
  }
}
