import { Injectable, inject } from '@angular/core';
import { Permission, WorkspacePermissionTab } from '@cacic-fct/shared-permissions';
import { EventGroupsService } from '../event-groups/event-groups.service';
import { EventsService } from '../events/events.service';
import { MajorEventsService } from '../major-events/major-events.service';
import { MergeCandidatesService } from '../merge-candidates/merge-candidates.service';
import { PeopleService } from '../people/people.service';
import { PlacePresetsService } from '../places/place-presets.service';
import { CertificatesService } from '../certificates/certificates.service';
import { PermissionsService } from '../permissions/permissions.service';
import { ShellUiService } from './ui.service';

@Injectable({
  providedIn: 'root',
})
export class ShellService {
  private readonly ui = inject(ShellUiService);
  private readonly eventsService = inject(EventsService);
  private readonly majorEventsService = inject(MajorEventsService);
  private readonly eventGroupsService = inject(EventGroupsService);
  private readonly peopleService = inject(PeopleService);
  private readonly placePresetsService = inject(PlacePresetsService);
  private readonly certificatesService = inject(CertificatesService);
  private readonly permissions = inject(PermissionsService);
  private readonly mergeCandidatesService = inject(MergeCandidatesService);

  readonly loading = this.ui.loading;

  async loadInitialData(): Promise<void> {
    this.ui.loading.set(true);
    try {
      await this.permissions.evaluateWorkspacePermissions();

      const loads: Promise<void>[] = [];

      const canReadEvents = this.permissions.canReadTab(WorkspacePermissionTab.Events);

      if (canReadEvents) {
        loads.push(this.eventsService.loadEvents());
        if (this.permissions.has(Permission.MajorEvent.Read)) {
          loads.push(this.eventsService.loadMajorEventsForEvent());
        }
      }

      if (this.permissions.canReadTab(WorkspacePermissionTab.Places)) {
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
