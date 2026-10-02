import { EventWorkspaceContextService } from '../event-workspace/event-workspace-context.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { EventApiService } from '../graphql/event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { EventGroupInput } from '@cacic-fct/event-manager-admin-contracts';
import { PublicationApiService } from '../graphql/publishing-api.service';
import {
  createAdminEvent,
  createAdminEventGroup,
  createAdminEventSummary,
  createAdminMajorEvent,
} from '../testing/admin-entity-fixtures';
import { EventGroupsService } from './event-groups.service';
import { EventsService } from '../events/events.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';

describe('EventGroupsService', () => {
  let service: EventGroupsService;
  let lastPayload: EventGroupInput | null;
  let api: {
    createEventGroup: ReturnType<typeof vi.fn>;
    updateEventGroup: ReturnType<typeof vi.fn>;
    listEventGroups: ReturnType<typeof vi.fn>;
    getEventGroup: ReturnType<typeof vi.fn>;
  };
  let eventApi: {
    listEventsSummary: ReturnType<typeof vi.fn>;
    listEvents: ReturnType<typeof vi.fn>;
    updateEvent: ReturnType<typeof vi.fn>;
  };
  let publicationApi: {
    setPublicationState: ReturnType<typeof vi.fn>;
  };
  let eventsService: {
    loadEvents: ReturnType<typeof vi.fn>;
    eventGroupLookupForm: { reset: ReturnType<typeof vi.fn> };
    majorEvents: ReturnType<typeof signal>;
  };
  let router: {
    navigate: ReturnType<typeof vi.fn>;
  };
  let feedback: {
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    lastPayload = null;
    api = {
      createEventGroup: vi.fn((payload: EventGroupInput) => {
        lastPayload = payload;
        return of(createAdminEventGroup({ id: 'event-group-1', ...payload }));
      }),
      updateEventGroup: vi.fn((id: string, payload: EventGroupInput) => {
        lastPayload = payload;
        return of(createAdminEventGroup({ id, ...payload }));
      }),
      listEventGroups: vi.fn(() => of([])),
      getEventGroup: vi.fn(() => of(createAdminEventGroup())),
    };
    eventApi = {
      listEventsSummary: vi.fn(() => of([])),
      listEvents: vi.fn(() => of([])),
      updateEvent: vi.fn(() => of({ id: 'event-1' })),
    };
    publicationApi = {
      setPublicationState: vi.fn(() => of({ ok: true })),
    };
    eventsService = {
      loadEvents: vi.fn(() => Promise.resolve()),
      eventGroupLookupForm: { reset: vi.fn() },
      majorEvents: signal([]),
    };
    router = {
      navigate: vi.fn(),
    };
    feedback = {
      error: vi.fn(),
    };

    await TestBed.configureTestingModule({
      providers: [
        EventGroupsService,
        { provide: EventWorkspaceContextService, useValue: { context: signal(null) } },
        { provide: EventGroupApiService, useValue: api },
        { provide: MajorEventApiService, useValue: { getMajorEvent: vi.fn(() => of(createAdminMajorEvent())) } },
        { provide: EventApiService, useValue: eventApi },
        { provide: PublicationApiService, useValue: publicationApi },
        { provide: EventsService, useValue: eventsService },
        { provide: PermissionsService, useValue: { hasAll: vi.fn(() => true), has: vi.fn(() => false) } },
        { provide: AdminFeedbackService, useValue: feedback },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    service = TestBed.inject(EventGroupsService);
    service.eventGroupForm.patchValue({
      name: 'Trilha de Minicursos',
      emoji: 'school',
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: true,
      shouldIssueCertificateForNonSubscribedAttendees: true,
      shouldIssueCertificateForEachEvent: true,
      shouldIssuePartialCertificate: true,
    });
  });

  it('tracks semantic event-group editor changes from a clean baseline', () => {
    service.startNewEventGroup(false);
    expect(service.unsavedChanges()).toBe(false);
    service.eventGroupForm.controls.name.setValue('Nome alterado');
    expect(service.unsavedChanges()).toBe(true);
    service.startNewEventGroup(false);
    expect(service.unsavedChanges()).toBe(false);
  });

  it('blocks creation in a frozen major event using its exact dates', async () => {
    const past = new Date(Date.now() - 120 * 86400000).toISOString();
    vi.mocked(TestBed.inject(MajorEventApiService).getMajorEvent).mockReturnValueOnce(of(createAdminMajorEvent({id:'old-major',createdAt:past,endDate:past})));
    await expect(service.initializeNewEventGroup('old-major')).rejects.toThrow('congelado');
    expect(service.eventGroupForm.controls.majorEventId.value).toBe('');
    expect(api.createEventGroup).not.toHaveBeenCalled();
  });

  it('persists a new empty group under its explicitly selected major event', async () => {
    vi.mocked(TestBed.inject(MajorEventApiService).getMajorEvent).mockReturnValue(of(createAdminMajorEvent({id:'major-parent',name:'Semana',emoji:'🎓'})));
    service.selectedEventGroup.set(createAdminEventGroup({id:'old-group'}));
    const parents=await service.initializeNewEventGroup('major-parent');
    expect(service.selectedEventGroup()).toBeNull();expect(service.eventGroupForm.controls.id.value).toBe('');
    expect(parents).toEqual([{kind:'major-event',id:'major-parent',name:'Semana',emoji:'🎓'}]);
    expect(router.navigate).not.toHaveBeenCalled();
    service.eventGroupForm.controls.name.setValue('Novo grupo');
    await service.saveEventGroup('DRAFT');
    expect(api.createEventGroup).toHaveBeenCalledWith(expect.objectContaining({name:'Novo grupo',majorEventId:'major-parent'}));
    expect(api.updateEventGroup).not.toHaveBeenCalled();
    expect(service.selectedEventGroup()?.majorEventId).toBe('major-parent');
    expect(router.navigate).toHaveBeenCalledWith(['/event-workspace', 'group', 'event-group-1', 'settings']);
  });

  it('does not let late group details overwrite the current group', async () => {
    const delayed=new Subject<ReturnType<typeof createAdminEventGroup>>();
    api.getEventGroup.mockReturnValueOnce(delayed).mockReturnValueOnce(of(createAdminEventGroup({id:'b'})));
    const first=service.pickEventGroupById('a');
    await service.pickEventGroupById('b');
    delayed.next(createAdminEventGroup({id:'a'}));delayed.complete();await first;
    expect(service.selectedEventGroup()?.id).toBe('b');expect(service.eventGroupForm.controls.id.value).toBe('b');
  });

  it('does not navigate to a saved group after its child list finishes for a newer selection', async () => {
    const delayedEvents = new Subject<ReturnType<typeof createAdminEvent>[]>();
    eventApi.listEvents.mockReturnValueOnce(delayedEvents);

    const save = service.saveEventGroup('DRAFT');
    await vi.waitFor(() => expect(eventApi.listEvents).toHaveBeenCalledWith({ eventGroupId: 'event-group-1', take: 200 }));
    service.startNewEventGroup(false);
    delayedEvents.next([]);
    delayedEvents.complete();
    await save;

    expect(router.navigate).not.toHaveBeenCalledWith(['/event-workspace', 'group', 'event-group-1', 'settings']);
    expect(service.selectedEventGroup()).toBeNull();
  });

  it('does not apply a saved group parent restriction after its parent finishes for a newer selection', async () => {
    const delayedMajor = new Subject<ReturnType<typeof createAdminMajorEvent>>();
    const majorApi = TestBed.inject(MajorEventApiService);
    vi.mocked(majorApi.getMajorEvent).mockReturnValueOnce(delayedMajor);
    vi.mocked(api.createEventGroup).mockReturnValueOnce(of(createAdminEventGroup({ id: 'event-group-1', majorEventId: 'major-1' })));
    service.eventGroupForm.controls.majorEventId.setValue('major-1');

    const save = service.saveEventGroup('DRAFT');
    await vi.waitFor(() => expect(majorApi.getMajorEvent).toHaveBeenCalledWith('major-1'));
    service.startNewEventGroup(false);
    delayedMajor.next(createAdminMajorEvent({ id: 'major-1' }));
    delayedMajor.complete();
    await save;

    expect(router.navigate).not.toHaveBeenCalledWith(['/event-workspace', 'group', 'event-group-1', 'settings']);
    expect(service.selectedEventGroup()).toBeNull();
    expect(service.selectedEventGroupMajorEventRestriction()).toBeNull();
  });

  it('publishes a saved group when it has linked events', async () => {
    service.eventGroupEvents.set([createAdminEvent({ id: 'event-1', eventGroupId: 'event-group-1' })]);

    await service.saveEventGroup('PUBLISH');

    expect(api.createEventGroup).toHaveBeenCalled();
    expect(publicationApi.setPublicationState).toHaveBeenCalledWith({
      targetType: 'EVENT_GROUP',
      targetId: 'event-group-1',
      state: 'PUBLISHED',
    });
    expect(lastPayload).toMatchObject({
      name: 'Trilha de Minicursos',
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: true,
      shouldIssueCertificateForNonSubscribedAttendees: true,
      shouldIssuePartialCertificate: true,
    });
  });

  it('keeps empty groups as saved drafts instead of publishing an empty set', async () => {
    await service.saveEventGroup('PUBLISH');

    expect(api.createEventGroup).toHaveBeenCalledWith(expect.objectContaining({ name: 'Trilha de Minicursos' }));
    expect(publicationApi.setPublicationState).not.toHaveBeenCalled();
    expect(service.selectedEventGroup()?.id).toBe('event-group-1');
  });

  it('persists independent interest and inherited attendance eligibility settings', async () => {
    service.eventGroupForm.patchValue({
      interestEnabled: true,
      attendanceEligibility: null,
    });

    await service.saveEventGroup('DRAFT');

    expect(lastPayload).toMatchObject({
      interestEnabled: true,
      attendanceEligibility: null,
    });
  });

  it('serializes selected invitees for invitation-only groups', async () => {
    service.eventGroupForm.patchValue({ audience: 'PUBLIC' });
    service.setEventGroupAudienceInvitations([{ id: 'person-1', name: 'Ana', email: 'ana@example.com' }]);

    await service.saveEventGroup('DRAFT');

    expect(lastPayload).toMatchObject({
      audience: 'PUBLIC',
      audienceCourseCodes: [],
      invitationPersonIds: ['person-1'],
    });
  });

  it('keeps invitation-only attendance visible independently of access audience', async () => {
    service.eventGroupForm.patchValue({
      audience: 'PUBLIC',
      attendanceEligibility: 'INVITED_ONLY',
    });

    expect(service.shouldManageAttendanceInvitations()).toBe(true);
    expect(service.audiencePublicationBlocked()).toBe(true);
    await service.saveEventGroup('PUBLISH');
    expect(api.createEventGroup).not.toHaveBeenCalled();

    await service.saveEventGroup('DRAFT');
    expect(api.createEventGroup).toHaveBeenCalled();
  });

  it('reports an unavailable parent rule instead of assuming public access', () => {
    service.selectedEventGroup.set(createAdminEventGroup({ majorEventId: 'major-event-1' }));

    expect(service.audienceParentRestrictions()).toEqual([
      expect.objectContaining({
        audience: null,
        unavailable: true,
      }),
    ]);
  });

  it('uses matching linked metadata when a direct parent lookup is unavailable', async () => {
    vi.mocked(TestBed.inject(MajorEventApiService).getMajorEvent).mockReturnValueOnce(throwError(() => new Error('Parent unavailable')));
    const majorEvent = createAdminMajorEvent({
      id: 'major-event-1',
      audience: 'UNESP_ONLY',
      attendanceEligibility: 'INVITED_ONLY',
    });
    const group = createAdminEventGroup({ majorEventId: majorEvent.id });
    eventApi.listEvents.mockReturnValueOnce(
      of([createAdminEvent({ eventGroupId: group.id, majorEventId: majorEvent.id, majorEvent })]),
    );

    await service.pickEventGroup(group);
    await Promise.resolve();

    expect(service.audienceParentRestrictions()).toEqual([
      expect.objectContaining({ audience: 'UNESP_ONLY', attendanceEligibility: 'INVITED_ONLY' }),
    ]);
    expect(service.shouldManageAttendanceInvitations()).toBe(true);
  });

  it('moves linked events back to draft when saving an existing group as draft', async () => {
    service.eventGroupForm.controls.id.setValue('event-group-1');
    service.selectedEventGroup.set(createAdminEventGroup({ id: 'event-group-1' }));
    service.eventGroupEvents.set([createAdminEvent({ id: 'event-1', eventGroupId: 'event-group-1' })]);

    await service.saveEventGroup('DRAFT');

    expect(api.updateEventGroup).toHaveBeenCalledWith(
      'event-group-1',
      expect.objectContaining({ name: 'Trilha de Minicursos' }),
    );
    expect(publicationApi.setPublicationState).toHaveBeenCalledWith({
      targetType: 'EVENT_GROUP',
      targetId: 'event-group-1',
      state: 'DRAFT',
    });
  });

  it('links events using the selected group certificate restrictions', async () => {
    const group = createAdminEventGroup({
      id: 'event-group-1',
      shouldIssueCertificate: false,
    });
    const event = createAdminEvent({
      id: 'event-1',
      shouldIssueCertificate: true,
    });
    service.selectedEventGroup.set(group);
    eventApi.listEventsSummary.mockReturnValue(of([createAdminEventSummary({ id: event.id, eventGroupId: group.id })]));

    await service.addEventToSelectedGroup(event);

    expect(eventApi.updateEvent).toHaveBeenCalledWith('event-1', {
      eventGroupId: 'event-group-1',
      shouldIssueCertificate: false,
    });
    expect(eventsService.loadEvents).toHaveBeenCalled();
  });

  it('prefills an explicit group parent when linking an event without a major event', async () => {
    const group = createAdminEventGroup({ id: 'event-group-1', majorEventId: 'major-1' });
    const event = createAdminEvent({ id: 'event-1', majorEventId: null });
    service.selectedEventGroup.set(group);

    await service.addEventToSelectedGroup(event);

    expect(eventApi.updateEvent).toHaveBeenCalledWith('event-1', {
      eventGroupId: 'event-group-1',
      majorEventId: 'major-1',
      shouldIssueCertificate: event.shouldIssueCertificate,
    });
  });

  it('rejects an event from another major event before linking it', async () => {
    const group = createAdminEventGroup({ id: 'event-group-1', majorEventId: 'major-1' });
    const event = createAdminEvent({ id: 'event-1', majorEventId: 'major-2' });
    service.selectedEventGroup.set(group);

    await service.addEventToSelectedGroup(event);

    expect(eventApi.updateEvent).not.toHaveBeenCalled();
    expect(feedback.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('outro grande evento') }),
      'Não foi possível adicionar o evento ao grupo.',
    );
  });

  it('shows a recoverable error when linking an event fails', async () => {
    const group = createAdminEventGroup({ id: 'event-group-1', majorEventId: null });
    const event = createAdminEvent({ id: 'event-1' });
    eventApi.updateEvent.mockReturnValueOnce(throwError(() => new Error('membership failed')));
    service.selectedEventGroup.set(group);

    await service.addEventToSelectedGroup(event);

    expect(feedback.error).toHaveBeenCalledWith(new Error('membership failed'), 'Não foi possível adicionar o evento ao grupo.');
  });

  it('searches event groups from the first page using the entered query', async () => {
    service.eventGroupsPagination.pageIndex.set(2);
    service.eventGroupsSearchForm.controls.query.setValue('minicursos', { emitEvent: false });

    await service.searchEventGroups();

    expect(api.listEventGroups).toHaveBeenCalledWith({ query: 'minicursos', skip: 0, take: 51 });
    expect(service.eventGroupsPagination.pageIndex()).toBe(0);
  });

  it('omits the query when loading the unfiltered event-group list', async () => {
    await service.loadEventGroups();

    expect(api.listEventGroups).toHaveBeenCalledWith({ skip: 0, take: 51 });
  });
});
