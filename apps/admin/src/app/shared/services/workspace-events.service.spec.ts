import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Permission } from '@cacic-fct/shared-permissions';
import { of } from 'rxjs';
import { EventApiService } from '../../graphql/event-api.service';
import { EventGroupApiService } from '../../graphql/event-group-api.service';
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
  let router: {
    navigate: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    lastPayload = null;
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
    router = {
      navigate: vi.fn(),
    };

    await TestBed.configureTestingModule({
      providers: [
        WorkspaceEventsService,
        WorkspaceUiService,
        { provide: EventApiService, useValue: api },
        { provide: PublicationApiService, useValue: publicationApi },
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
            has: vi.fn((scope: Permission) => scope === Permission.Event.Update),
          },
        },
        {
          provide: WorkspacePlacePresetsService,
          useValue: {
            placePresets: signal([]),
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
});
