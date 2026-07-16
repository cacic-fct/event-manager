import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Permission } from '@cacic-fct/shared-permissions';
import { of } from 'rxjs';
import { EventApiService } from '../../graphql/event-api.service';
import { EventGroupApiService } from '../../graphql/event-group-api.service';
import { MajorEventApiService } from '../../graphql/major-event-api.service';
import { EventInput } from '@cacic-fct/event-manager-admin-contracts';
import { PeopleApiService } from '../../graphql/people-api.service';
import { PublicationApiService } from '../../graphql/publishing-api.service';
import {
  createAdminEvent,
  createAdminEventDraft,
  createAdminMajorEvent,
  createAdminPerson,
} from '../../testing/admin-entity-fixtures';
import { WorkspaceEventsService } from './workspace-events.service';
import { WorkspaceMajorEventsService } from './workspace-major-events.service';
import { WorkspacePermissionsService } from './workspace-permissions.service';
import { WorkspacePlacePresetsService } from './workspace-place-presets.service';
import { WorkspaceUiService } from './workspace-ui.service';

describe('WorkspaceEventsService', () => {
  let service: WorkspaceEventsService;
  let lastPayload: EventInput | null;
  let api: {
    createEvent: ReturnType<typeof vi.fn>;
    updateEvent: ReturnType<typeof vi.fn>;
    listEvents: ReturnType<typeof vi.fn>;
    getEvent: ReturnType<typeof vi.fn>;
    listEventDrafts: ReturnType<typeof vi.fn>;
    saveEventDraft: ReturnType<typeof vi.fn>;
    applyEventDraft: ReturnType<typeof vi.fn>;
    listEventLecturers: ReturnType<typeof vi.fn>;
    listEventAttendanceCollectors: ReturnType<typeof vi.fn>;
  };
  let publicationApi: {
    setPublicationState: ReturnType<typeof vi.fn>;
  };
  let majorEventApi: {
    listMajorEvents: ReturnType<typeof vi.fn>;
  };
  let router: {
    navigate: ReturnType<typeof vi.fn>;
  };
  let grantedPermissions: Set<Permission>;

  beforeEach(async () => {
    lastPayload = null;
    grantedPermissions = new Set([Permission.Event.Update, Permission.MajorEvent.Read, Permission.PlacePreset.Read]);
    api = {
      createEvent: vi.fn((payload: EventInput) => {
        lastPayload = payload;
        return of({ id: 'event-1' });
      }),
      updateEvent: vi.fn((id: string, payload: EventInput) => {
        lastPayload = payload;
        return of({ id });
      }),
      listEvents: vi.fn(() => of([])),
      getEvent: vi.fn(() => of(createAdminEvent())),
      listEventDrafts: vi.fn(() => of([])),
      saveEventDraft: vi.fn((input: { sourceEventId: string; draftId?: string | null; input: EventInput }) => {
        lastPayload = input.input;
        return of(createAdminEventDraft({ id: input.draftId ?? 'event-draft-1' }, input.input));
      }),
      applyEventDraft: vi.fn(() => of({ id: 'event-1' })),
      listEventLecturers: vi.fn(() => of([])),
      listEventAttendanceCollectors: vi.fn(() => of([])),
    };
    publicationApi = {
      setPublicationState: vi.fn(() => of({ ok: true })),
    };
    majorEventApi = {
      listMajorEvents: vi.fn(() => of([createAdminMajorEvent({ id: 'major-event-1', name: 'SECOMPP' })])),
    };
    router = {
      navigate: vi.fn(),
    };

    await TestBed.configureTestingModule({
      providers: [
        WorkspaceEventsService,
        WorkspaceUiService,
        { provide: EventApiService, useValue: api },
        { provide: PublicationApiService, useValue: publicationApi },
        { provide: MajorEventApiService, useValue: majorEventApi },
        { provide: EventGroupApiService, useValue: { getEventGroup: vi.fn() } },
        { provide: PeopleApiService, useValue: { listPeopleSummaries: vi.fn(() => of([])) } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: Router, useValue: router },
        { provide: WorkspaceMajorEventsService, useValue: { majorEvents: signal([createAdminMajorEvent()]) } },
        {
          provide: WorkspacePermissionsService,
          useValue: {
            canEdit: vi.fn(() => true),
            hasAll: vi.fn(() => true),
            has: vi.fn((scope: Permission) => grantedPermissions.has(scope)),
          },
        },
        {
          provide: WorkspacePlacePresetsService,
          useValue: {
            placePresets: signal([]),
            searchPlacePresets: vi.fn(() => Promise.resolve([])),
            ensurePresetForManualLocation: vi.fn(() => Promise.resolve()),
          },
        },
      ],
    }).compileComponents();

    service = TestBed.inject(WorkspaceEventsService);
    service.eventForm.patchValue({
      name: 'Oficina de Angular',
      emoji: 'computer',
      startDate: '2026-05-21T14:00',
      endDate: '2026-05-21T16:00',
      type: 'MINICURSO',
      allowSubscription: true,
      slots: '30',
      shouldCollectAttendance: true,
      locationDescription: '',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates an event draft and keeps the event unpublished on draft save', async () => {
    await service.saveEvent('DRAFT');

    expect(api.createEvent).toHaveBeenCalled();
    expect(lastPayload).toMatchObject({
      name: 'Oficina de Angular',
      type: 'MINICURSO',
      allowSubscription: true,
      slots: 30,
      shouldCollectAttendance: true,
    });
    expect(publicationApi.setPublicationState).toHaveBeenCalledWith({
      targetType: 'EVENT',
      targetId: 'event-1',
      state: 'DRAFT',
    });
  });

  it('publishes newly created events through the publication API', async () => {
    await service.saveEvent('PUBLISH');

    expect(api.createEvent).toHaveBeenCalled();
    expect(publicationApi.setPublicationState).toHaveBeenCalledWith({
      targetType: 'EVENT',
      targetId: 'event-1',
      state: 'PUBLISHED',
    });
  });

  it('publishes existing event edits in the update mutation without a second publication mutation', async () => {
    const publishedEvent = createAdminEvent({ id: 'event-1', publicationState: 'PUBLISHED' });
    service.selectedEvent.set(publishedEvent);
    service.eventForm.controls.id.setValue(publishedEvent.id);

    await service.saveEvent('PUBLISH');

    expect(api.updateEvent).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({ publishAfterUpdate: true }),
    );
    expect(publicationApi.setPublicationState).not.toHaveBeenCalled();
  });

  it('saves the lecturer profile visibility toggle in event payloads', async () => {
    service.eventForm.controls.displayLecturerProfile.setValue(false);

    await service.saveEvent('DRAFT');

    expect(lastPayload).toMatchObject({
      displayLecturerProfile: false,
    });
  });

  it('routes schedule saves to the publication scheduling screen after saving a draft', async () => {
    await service.saveEvent('SCHEDULE');

    expect(publicationApi.setPublicationState).toHaveBeenCalledWith({
      targetType: 'EVENT',
      targetId: 'event-1',
      state: 'DRAFT',
    });
    expect(router.navigate).toHaveBeenCalledWith(['/publication', 'event', 'event-1']);
  });

  it('saves published event edits as a separate draft without touching the publication', async () => {
    const publishedEvent = createAdminEvent({ id: 'event-1', publicationState: 'PUBLISHED' });
    service.selectedEvent.set(publishedEvent);
    service.eventForm.controls.id.setValue(publishedEvent.id);
    service.eventForm.controls.name.setValue('Oficina de Angular atualizada');

    await service.saveEvent('DRAFT');

    expect(api.updateEvent).not.toHaveBeenCalled();
    expect(api.saveEventDraft).toHaveBeenCalledWith({
      sourceEventId: 'event-1',
      draftId: undefined,
      input: expect.objectContaining({ name: 'Oficina de Angular atualizada' }),
    });
    expect(publicationApi.setPublicationState).not.toHaveBeenCalled();
    expect(service.selectedEventDraft()?.id).toBe('event-draft-1');
  });

  it('applies a selected draft when publishing draft edits for an already published event', async () => {
    const person = createAdminPerson({ id: 'collector-1', name: 'Coletor' });
    const publishedEvent = createAdminEvent({ id: 'event-1', publicationState: 'PUBLISHED' });
    const selectedDraft = createAdminEventDraft({ id: 'event-draft-1', sourceEventId: 'event-1' }, { name: 'Rascunho' });
    api.listEventAttendanceCollectors.mockReturnValue(of([{ eventId: 'event-1', personId: person.id, person, createdAt: '2026-05-21T12:00:00.000Z' }]));
    api.getEvent.mockReturnValue(of(createAdminEvent({ id: 'event-1', name: 'Evento publicado' })));
    service.selectedEvent.set(publishedEvent);
    service.selectedEventDraft.set(selectedDraft);
    service.eventForm.controls.id.setValue(publishedEvent.id);
    service.eventForm.controls.name.setValue('Versão final');

    await service.saveEvent('PUBLISH');

    expect(api.saveEventDraft).toHaveBeenCalledWith({
      sourceEventId: 'event-1',
      draftId: 'event-draft-1',
      input: expect.objectContaining({ name: 'Versão final' }),
    });
    expect(api.applyEventDraft).toHaveBeenCalledWith('event-draft-1');
    expect(api.getEvent).toHaveBeenCalledWith('event-1');
    expect(service.selectedEventDraft()).toBeNull();
  });

  it('loads current and future major events by default for the event editor lookup', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-05T12:00:00.000Z'));

    await service.loadMajorEventsForEvent();

    expect(majorEventApi.listMajorEvents).toHaveBeenCalledWith({
      endDateFrom: '2026-07-05T12:00:00.000Z',
      take: 50,
    });
    expect(service.majorEventSearchResults()).toEqual([
      expect.objectContaining({ id: 'major-event-1', name: 'SECOMPP' }),
    ]);
  });

  it('searches major events without a date boundary so past major events can be selected', async () => {
    const pastMajorEvent = createAdminMajorEvent({
      id: 'major-event-past',
      name: 'SECOMPP 2024',
      startDate: '2024-07-01T12:00:00.000Z',
      endDate: '2024-07-05T12:00:00.000Z',
    });
    majorEventApi.listMajorEvents.mockReturnValue(of([pastMajorEvent]));
    service.majorEventLookupForm.controls.query.setValue('SECOMPP 2024', { emitEvent: false });

    await service.searchMajorEventsForEvent();

    expect(majorEventApi.listMajorEvents).toHaveBeenCalledWith({
      query: 'SECOMPP 2024',
      take: 50,
    });
    expect(service.majorEventSearchResults()).toEqual([pastMajorEvent]);
  });

  it('selects an existing place preset when loaded event location values match it', async () => {
    const placePresets = TestBed.inject(WorkspacePlacePresetsService);
    placePresets.placePresets.set([
      {
        id: 'place-auditorio',
        name: 'Auditório principal',
        latitude: -22.12,
        longitude: -51.4,
        locationDescription: 'Auditório da FCT',
        createdAt: '2026-05-21T12:00:00.000Z',
        updatedAt: '2026-05-21T12:00:00.000Z',
      },
    ]);
    api.getEvent.mockReturnValue(
      of(
        createAdminEvent({
          id: 'event-1',
          latitude: -22.12,
          longitude: -51.4,
          locationDescription: 'Auditório da FCT',
        }),
      ),
    );

    await service.selectEventById('event-1');

    expect(service.eventForm.controls.locationPresetId.value).toBe('place-auditorio');
  });

  it('searches saved places before treating loaded event location values as custom', async () => {
    const placePresets = TestBed.inject(WorkspacePlacePresetsService);
    vi.mocked(placePresets.searchPlacePresets).mockResolvedValue([
      {
        id: 'place-auditorio',
        name: 'Auditório principal',
        latitude: -22.12,
        longitude: -51.4,
        locationDescription: 'Auditório da FCT',
        createdAt: '2026-05-21T12:00:00.000Z',
        updatedAt: '2026-05-21T12:00:00.000Z',
      },
    ]);
    api.getEvent.mockReturnValue(
      of(
        createAdminEvent({
          id: 'event-1',
          latitude: -22.12,
          longitude: -51.4,
          locationDescription: 'Auditório da FCT',
        }),
      ),
    );

    await service.selectEventById('event-1');

    expect(placePresets.searchPlacePresets).toHaveBeenCalledWith('Auditório da FCT', 8);
    expect(service.eventForm.controls.locationPresetId.value).toBe('place-auditorio');
  });

  it('does not query place presets while loading events without place preset read permission', async () => {
    grantedPermissions.delete(Permission.PlacePreset.Read);
    const placePresets = TestBed.inject(WorkspacePlacePresetsService);
    api.getEvent.mockReturnValue(
      of(
        createAdminEvent({
          id: 'event-1',
          latitude: -22.12,
          longitude: -51.4,
          locationDescription: 'Auditório da FCT',
        }),
      ),
    );

    await service.selectEventById('event-1');

    expect(placePresets.searchPlacePresets).not.toHaveBeenCalled();
    expect(service.eventForm.controls.locationPresetId.value).toBe('PERSONALIZADO');
  });

  it('marks the location as custom when a copied place preset is edited', () => {
    const placePresets = TestBed.inject(WorkspacePlacePresetsService);
    placePresets.placePresets.set([
      {
        id: 'place-auditorio',
        name: 'Auditório principal',
        latitude: -22.12,
        longitude: -51.4,
        locationDescription: 'Auditório da FCT',
        createdAt: '2026-05-21T12:00:00.000Z',
        updatedAt: '2026-05-21T12:00:00.000Z',
      },
    ]);

    service.applyPlacePreset('place-auditorio');
    service.eventForm.controls.locationDescription.setValue('Auditório da FCT - palco 2');

    expect(service.eventForm.controls.locationPresetId.value).toBe('PERSONALIZADO');
  });

  it('loads place preset suggestions from the backend search service', async () => {
    const placePresets = TestBed.inject(WorkspacePlacePresetsService);
    const suggestion = {
      id: 'place-lab',
      name: 'Laboratório 1',
      latitude: null,
      longitude: null,
      locationDescription: 'Lab de computadores',
      createdAt: '2026-05-21T12:00:00.000Z',
      updatedAt: '2026-05-21T12:00:00.000Z',
    };
    vi.mocked(placePresets.searchPlacePresets).mockResolvedValue([suggestion]);
    service.eventForm.controls.locationDescription.setValue('lab', { emitEvent: false });

    await service.searchPlacePresetSuggestions();

    expect(placePresets.searchPlacePresets).toHaveBeenCalledWith('lab', 8);
    expect(service.placePresetSuggestions()).toEqual([suggestion]);
  });
});
