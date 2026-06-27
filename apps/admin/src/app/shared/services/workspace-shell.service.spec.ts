import { TestBed } from '@angular/core/testing';
import { WorkspacePermissionTab } from '@cacic-fct/shared-permissions';
import { WorkspaceCertificatesService } from './workspace-certificates.service';
import { WorkspaceEventGroupsService } from './workspace-event-groups.service';
import { WorkspaceEventsService } from './workspace-events.service';
import { WorkspaceMajorEventsService } from './workspace-major-events.service';
import { WorkspaceMergeCandidatesService } from './workspace-merge-candidates.service';
import { WorkspacePeopleService } from './workspace-people.service';
import { WorkspacePermissionsService } from './workspace-permissions.service';
import { WorkspacePlacePresetsService } from './workspace-place-presets.service';
import { WorkspaceShellService } from './workspace-shell.service';
import { WorkspaceUiService } from './workspace-ui.service';

describe('WorkspaceShellService', () => {
  let readableTabs: Set<WorkspacePermissionTab>;
  let permissions: {
    evaluateWorkspacePermissions: ReturnType<typeof vi.fn>;
    canReadTab: ReturnType<typeof vi.fn>;
  };
  let eventsService: { loadEvents: ReturnType<typeof vi.fn> };
  let majorEventsService: { loadMajorEvents: ReturnType<typeof vi.fn> };
  let eventGroupsService: { loadEventGroups: ReturnType<typeof vi.fn> };
  let peopleService: { searchPeople: ReturnType<typeof vi.fn> };
  let placePresetsService: { loadPlacePresets: ReturnType<typeof vi.fn> };
  let certificatesService: { loadInitialData: ReturnType<typeof vi.fn> };
  let mergeCandidatesService: { scanMergeCandidates: ReturnType<typeof vi.fn> };
  let ui: WorkspaceUiService;
  let service: WorkspaceShellService;

  beforeEach(() => {
    readableTabs = new Set();
    permissions = {
      evaluateWorkspacePermissions: vi.fn().mockResolvedValue(undefined),
      canReadTab: vi.fn((tab: WorkspacePermissionTab) => readableTabs.has(tab)),
    };
    eventsService = { loadEvents: vi.fn().mockResolvedValue(undefined) };
    majorEventsService = { loadMajorEvents: vi.fn().mockResolvedValue(undefined) };
    eventGroupsService = { loadEventGroups: vi.fn().mockResolvedValue(undefined) };
    peopleService = { searchPeople: vi.fn().mockResolvedValue(undefined) };
    placePresetsService = { loadPlacePresets: vi.fn().mockResolvedValue(undefined) };
    certificatesService = { loadInitialData: vi.fn().mockResolvedValue(undefined) };
    mergeCandidatesService = { scanMergeCandidates: vi.fn().mockResolvedValue(undefined) };

    TestBed.configureTestingModule({
      providers: [
        WorkspaceShellService,
        WorkspaceUiService,
        { provide: WorkspacePermissionsService, useValue: permissions },
        { provide: WorkspaceEventsService, useValue: eventsService },
        { provide: WorkspaceMajorEventsService, useValue: majorEventsService },
        { provide: WorkspaceEventGroupsService, useValue: eventGroupsService },
        { provide: WorkspacePeopleService, useValue: peopleService },
        { provide: WorkspacePlacePresetsService, useValue: placePresetsService },
        { provide: WorkspaceCertificatesService, useValue: certificatesService },
        { provide: WorkspaceMergeCandidatesService, useValue: mergeCandidatesService },
      ],
    });

    ui = TestBed.inject(WorkspaceUiService);
    service = TestBed.inject(WorkspaceShellService);
  });

  it('preloads only tabs allowed by evaluated workspace permissions', async () => {
    readableTabs = new Set([
      WorkspacePermissionTab.Events,
      WorkspacePermissionTab.Places,
      WorkspacePermissionTab.Certificates,
      WorkspacePermissionTab.MergeCandidates,
    ]);

    await service.loadInitialData();

    expect(permissions.evaluateWorkspacePermissions).toHaveBeenCalledTimes(1);
    expect(eventsService.loadEvents).toHaveBeenCalledTimes(1);
    expect(placePresetsService.loadPlacePresets).toHaveBeenCalledTimes(1);
    expect(certificatesService.loadInitialData).toHaveBeenCalledTimes(1);
    expect(mergeCandidatesService.scanMergeCandidates).toHaveBeenCalledWith(false);
    expect(majorEventsService.loadMajorEvents).not.toHaveBeenCalled();
    expect(eventGroupsService.loadEventGroups).not.toHaveBeenCalled();
    expect(peopleService.searchPeople).not.toHaveBeenCalled();
    expect(ui.loading()).toBe(false);
  });

  it('clears the shell loading state when a preload fails', async () => {
    readableTabs = new Set([WorkspacePermissionTab.Events]);
    eventsService.loadEvents.mockRejectedValueOnce(new Error('Falha ao carregar eventos.'));

    await expect(service.loadInitialData()).rejects.toThrow('Falha ao carregar eventos.');

    expect(ui.loading()).toBe(false);
  });
});
