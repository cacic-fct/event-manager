import { TestBed } from '@angular/core/testing';
import { Permission, WorkspacePermissionTab } from '@cacic-fct/shared-permissions';
import { CertificatesService } from '../../features/certificates/data-access/certificates.service';
import { EventGroupsService } from '../../features/event-groups/data-access/event-groups.service';
import { EventsService } from '../../features/events/data-access/events.service';
import { MajorEventsService } from '../../features/major-events/data-access/major-events.service';
import { MergeCandidatesService } from '../../features/merge-candidates/data-access/merge-candidates.service';
import { PeopleService } from '../../features/people/data-access/people.service';
import { PermissionsService } from '../../features/permissions/data-access/permissions.service';
import { PlacePresetsService } from '../../features/places/data-access/place-presets.service';
import { ShellService } from './shell.service';
import { ShellUiService } from './ui.service';

describe('ShellService', () => {
  let readableTabs: Set<WorkspacePermissionTab>;
  let permissions: {
    evaluateWorkspacePermissions: ReturnType<typeof vi.fn>;
    canReadTab: ReturnType<typeof vi.fn>;
    has: ReturnType<typeof vi.fn>;
  };
  let eventsService: { loadEvents: ReturnType<typeof vi.fn>; loadMajorEventsForEvent: ReturnType<typeof vi.fn> };
  let majorEventsService: { loadMajorEvents: ReturnType<typeof vi.fn> };
  let eventGroupsService: { loadEventGroups: ReturnType<typeof vi.fn> };
  let peopleService: { searchPeople: ReturnType<typeof vi.fn> };
  let placePresetsService: { loadPlacePresets: ReturnType<typeof vi.fn> };
  let certificatesService: { loadInitialData: ReturnType<typeof vi.fn> };
  let mergeCandidatesService: { scanMergeCandidates: ReturnType<typeof vi.fn> };
  let ui: ShellUiService;
  let service: ShellService;

  beforeEach(() => {
    readableTabs = new Set();
    permissions = {
      evaluateWorkspacePermissions: vi.fn().mockResolvedValue(undefined),
      canReadTab: vi.fn((tab: WorkspacePermissionTab) => readableTabs.has(tab)),
      has: vi.fn(() => false),
    };
    eventsService = {
      loadEvents: vi.fn().mockResolvedValue(undefined),
      loadMajorEventsForEvent: vi.fn().mockResolvedValue(undefined),
    };
    majorEventsService = { loadMajorEvents: vi.fn().mockResolvedValue(undefined) };
    eventGroupsService = { loadEventGroups: vi.fn().mockResolvedValue(undefined) };
    peopleService = { searchPeople: vi.fn().mockResolvedValue(undefined) };
    placePresetsService = { loadPlacePresets: vi.fn().mockResolvedValue(undefined) };
    certificatesService = { loadInitialData: vi.fn().mockResolvedValue(undefined) };
    mergeCandidatesService = { scanMergeCandidates: vi.fn().mockResolvedValue(undefined) };

    TestBed.configureTestingModule({
      providers: [
        ShellService,
        ShellUiService,
        { provide: PermissionsService, useValue: permissions },
        { provide: EventsService, useValue: eventsService },
        { provide: MajorEventsService, useValue: majorEventsService },
        { provide: EventGroupsService, useValue: eventGroupsService },
        { provide: PeopleService, useValue: peopleService },
        { provide: PlacePresetsService, useValue: placePresetsService },
        { provide: CertificatesService, useValue: certificatesService },
        { provide: MergeCandidatesService, useValue: mergeCandidatesService },
      ],
    });

    ui = TestBed.inject(ShellUiService);
    service = TestBed.inject(ShellService);
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
    expect(eventsService.loadMajorEventsForEvent).not.toHaveBeenCalled();
    expect(placePresetsService.loadPlacePresets).toHaveBeenCalledTimes(1);
    expect(certificatesService.loadInitialData).toHaveBeenCalledTimes(1);
    expect(mergeCandidatesService.scanMergeCandidates).toHaveBeenCalledWith(false);
    expect(majorEventsService.loadMajorEvents).not.toHaveBeenCalled();
    expect(eventGroupsService.loadEventGroups).not.toHaveBeenCalled();
    expect(peopleService.searchPeople).not.toHaveBeenCalled();
    expect(ui.loading()).toBe(false);
  });

  it('preloads event-editor major-event choices when the user can read major events', async () => {
    readableTabs = new Set([WorkspacePermissionTab.Events]);
    permissions.has.mockImplementation((scope: Permission) => scope === Permission.MajorEvent.Read);

    await service.loadInitialData();

    expect(eventsService.loadEvents).toHaveBeenCalledTimes(1);
    expect(eventsService.loadMajorEventsForEvent).toHaveBeenCalledTimes(1);
    expect(majorEventsService.loadMajorEvents).not.toHaveBeenCalled();
  });

  it('clears the shell loading state when a preload fails', async () => {
    readableTabs = new Set([WorkspacePermissionTab.Events]);
    eventsService.loadEvents.mockRejectedValueOnce(new Error('Falha ao carregar eventos.'));

    await expect(service.loadInitialData()).rejects.toThrow('Falha ao carregar eventos.');

    expect(ui.loading()).toBe(false);
  });
});
