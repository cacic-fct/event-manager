import { Injectable, inject } from '@angular/core';
import { WorkspaceEventGroupsService } from './workspace-event-groups.service';
import { WorkspaceEventsService } from './workspace-events.service';
import { WorkspaceMajorEventsService } from './workspace-major-events.service';
import { WorkspaceMergeCandidatesService } from './workspace-merge-candidates.service';
import { WorkspacePeopleService } from './workspace-people.service';
import { WorkspaceCertificatesService } from './workspace-certificates.service';
import { WorkspacePermissionsService } from './workspace-permissions.service';
import { WorkspaceUiService } from './workspace-ui.service';

@Injectable({
  providedIn: 'root',
})
export class WorkspaceShellService {
  private readonly ui = inject(WorkspaceUiService);
  private readonly eventsService = inject(WorkspaceEventsService);
  private readonly majorEventsService = inject(WorkspaceMajorEventsService);
  private readonly eventGroupsService = inject(WorkspaceEventGroupsService);
  private readonly peopleService = inject(WorkspacePeopleService);
  private readonly certificatesService = inject(WorkspaceCertificatesService);
  private readonly permissions = inject(WorkspacePermissionsService);
  private readonly mergeCandidatesService = inject(
    WorkspaceMergeCandidatesService,
  );

  readonly loading = this.ui.loading;

  async loadInitialData(): Promise<void> {
    this.ui.loading.set(true);
    try {
      await this.permissions.evaluateWorkspacePermissions();

      const loads: Promise<void>[] = [];

      if (this.permissions.canReadTab(0)) {
        loads.push(this.eventsService.loadEvents());
      }

      if (this.permissions.canReadTab(1)) {
        loads.push(this.majorEventsService.loadMajorEvents());
      }

      if (this.permissions.canReadTab(2)) {
        loads.push(this.eventGroupsService.loadEventGroups());
      }

      if (this.permissions.canReadTab(3)) {
        loads.push(this.peopleService.searchPeople(''));
      }

      if (this.permissions.canReadTab(5)) {
        loads.push(this.certificatesService.loadInitialData());
      }

      if (this.permissions.canReadTab(4)) {
        loads.push(this.mergeCandidatesService.scanMergeCandidates(false));
      }

      await Promise.all(loads);
    } finally {
      this.ui.loading.set(false);
    }
  }
}
