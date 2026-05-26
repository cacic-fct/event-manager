import { Injectable, inject } from '@angular/core';
import { WorkspaceEventGroupsService } from './workspace-event-groups.service';
import { WorkspaceEventsService } from './workspace-events.service';
import { WorkspaceMajorEventsService } from './workspace-major-events.service';
import { WorkspaceMergeCandidatesService } from './workspace-merge-candidates.service';
import { WorkspacePeopleService } from './workspace-people.service';
import { WorkspacePlacePresetsService } from './workspace-place-presets.service';
import { WorkspaceCertificatesService } from './workspace-certificates.service';
import { WorkspacePermissionTab, WorkspacePermissionsService } from './workspace-permissions.service';
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
  private readonly placePresetsService = inject(WorkspacePlacePresetsService);
  private readonly certificatesService = inject(WorkspaceCertificatesService);
  private readonly permissions = inject(WorkspacePermissionsService);
  private readonly mergeCandidatesService = inject(WorkspaceMergeCandidatesService);

  readonly loading = this.ui.loading;

  async loadInitialData(): Promise<void> {
    this.ui.loading.set(true);
    try {
      await this.permissions.evaluateWorkspacePermissions();

      const loads: Promise<void>[] = [];

      if (this.permissions.canReadTab(WorkspacePermissionTab.Events)) {
        loads.push(this.eventsService.loadEvents());
        loads.push(this.placePresetsService.loadPlacePresets());
      }

      if (this.permissions.canReadTab(WorkspacePermissionTab.MajorEvents)) {
        loads.push(this.majorEventsService.loadMajorEvents());
      }

      if (this.permissions.canReadTab(WorkspacePermissionTab.Groups)) {
        loads.push(this.eventGroupsService.loadEventGroups());
      }

      if (this.permissions.canReadTab(WorkspacePermissionTab.People)) {
        loads.push(this.peopleService.searchPeople(''));
      }

      if (this.permissions.canReadTab(WorkspacePermissionTab.Certificates)) {
        loads.push(this.certificatesService.loadInitialData());
      }

      if (this.permissions.canReadTab(WorkspacePermissionTab.MergeCandidates)) {
        loads.push(this.mergeCandidatesService.scanMergeCandidates(false));
      }

      await Promise.all(loads);
    } finally {
      this.ui.loading.set(false);
    }
  }
}
