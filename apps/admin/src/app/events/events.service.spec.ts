import { EventWorkspaceContextService } from '../event-workspace/event-workspace-context.service';
import { flushAsync } from '../testing/async-test-helpers';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Permission } from '@cacic-fct/shared-permissions';
import { of, Subject, throwError } from 'rxjs';
import { EventApiService } from '../graphql/event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { EventInput } from '@cacic-fct/event-manager-admin-contracts';
import { PeopleApiService } from '../graphql/people-api.service';
import { PublicationApiService } from '../graphql/publishing-api.service';
import {
  createAdminEvent,
  createAdminEventDraft,
  createAdminEventGroup,
  createAdminMajorEvent,
  createAdminPerson,
} from '../testing/admin-entity-fixtures';
import { EventsService } from './events.service';
import { MajorEventsService } from '../major-events/major-events.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PlacePresetsService } from '../places/place-presets.service';
import { ShellUiService } from '../app-shell/ui.service';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { WorkspacePendingChangesService } from '../app-shell/workspace-pending-changes.service';

describe('EventsService', () => {
  it('reloads the saved event after confirmed discard and reopening the same selection', async () => {
    const savedEvent = createAdminEvent({ id: 'event-1', name: 'Nome salvo' });
    api.getEvent.mockReturnValue(of(savedEvent));
    await service.selectEventById(savedEvent.id, { skipIfCurrent: true });
    service.eventForm.controls.name.setValue('Nome descartado');
    vi.mocked(TestBed.inject(MatDialog).open).mockReturnValue({ afterClosed: () => of(true) } as never);
    const pendingChanges = TestBed.inject(WorkspacePendingChangesService);
    const registration = pendingChanges.register(() => service.discardChanges());
    registration.set(service.unsavedChanges());

    await expect(pendingChanges.canDeactivate()).resolves.toBe(true);
    expect(service.selectedEvent()?.id).toBe(savedEvent.id);
    expect(service.eventForm.controls.name.value).toBe('Nome salvo');
    registration.destroy();
    await service.selectEventById(savedEvent.id, { skipIfCurrent: true });

    expect(service.eventForm.controls.name.value).toBe('Nome salvo');
    expect(service.unsavedChanges()).toBe(false);
    expect(api.getEvent).toHaveBeenCalledTimes(2);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  let service: EventsService;
  let lastPayload: EventInput | null;
  let api: {
    cloneEvent: ReturnType<typeof vi.fn>;
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
    getMajorEvent: ReturnType<typeof vi.fn>;
    listMajorEvents: ReturnType<typeof vi.fn>;
  };
  let router: {
    navigate: ReturnType<typeof vi.fn>;
  };
  let peopleApi: {
    listPeopleSummaries: ReturnType<typeof vi.fn>;
    getPerson: ReturnType<typeof vi.fn>;
  };
  let grantedPermissions: Set<Permission>;
  let feedback: {
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    lastPayload = null;
    grantedPermissions = new Set([Permission.Event.Update, Permission.MajorEvent.Read, Permission.PlacePreset.Read]);
    api = {
      cloneEvent: vi.fn(),
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
      getMajorEvent: vi.fn(() => of(createAdminMajorEvent())),
      listMajorEvents: vi.fn(() => of([createAdminMajorEvent({ id: 'major-event-1', name: 'SECOMPP' })])),
    };
    router = {
      navigate: vi.fn(),
    };
    peopleApi = {
      listPeopleSummaries: vi.fn(() => of([])),
      getPerson: vi.fn((id: string) => of(createAdminPerson({ id, name: 'Pessoa do rascunho', email: null }))),
    };
    feedback = {
      error: vi.fn(),
    };

    await TestBed.configureTestingModule({
      providers: [
        EventsService,
        { provide: EventWorkspaceContextService, useValue: { context: signal(null) } },
        ShellUiService,
        { provide: EventApiService, useValue: api },
        { provide: PublicationApiService, useValue: publicationApi },
        { provide: MajorEventApiService, useValue: majorEventApi },
        { provide: EventGroupApiService, useValue: { getEventGroup: vi.fn() } },
        { provide: PeopleApiService, useValue: peopleApi },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: Router, useValue: router },
        { provide: MajorEventsService, useValue: { majorEvents: signal([createAdminMajorEvent()]) } },
        { provide: AdminFeedbackService, useValue: feedback },
        {
          provide: PermissionsService,
          useValue: {
            canEdit: vi.fn(() => true),
            hasAll: vi.fn(() => true),
            has: vi.fn((scope: Permission) => grantedPermissions.has(scope)),
          },
        },
        {
          provide: PlacePresetsService,
          useValue: {
            placePresets: signal([]),
            searchPlacePresets: vi.fn(() => Promise.resolve([])),
            ensurePresetForManualLocation: vi.fn(() => Promise.resolve()),
          },
        },
      ],
    }).compileComponents();

    service = TestBed.inject(EventsService);
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

  it('tracks semantic event editor changes from a clean baseline', () => {
    service.resetEventForm(false);
    expect(service.unsavedChanges()).toBe(false);
    service.eventForm.controls.name.setValue('Nome alterado');
    expect(service.unsavedChanges()).toBe(true);
    service.resetEventForm(false);
    expect(service.unsavedChanges()).toBe(false);
  });

  it('opens the cloned event workspace so subsequent operations target the copy', async () => {
    const copy = createAdminEvent({ id: 'event-copy', name: 'Cópia' });
    api.cloneEvent.mockReturnValue(of(copy));
    api.getEvent.mockReturnValue(of(copy));
    vi.mocked(TestBed.inject(MatDialog).open).mockReturnValue({
      afterClosed: () => of({ name: copy.name, parts: {} }),
    } as never);
    await service.cloneEvent(createAdminEvent());
    expect(service.selectedEvent()?.id).toBe(copy.id);
    expect(router.navigate).toHaveBeenCalledWith(['/event-workspace', 'event', copy.id, 'settings']);
  });

  it('does not replace a fresh creator when an earlier save finishes later', async () => {
    const created = new Subject<{id:string}>();
    api.createEvent.mockReturnValueOnce(created);
    const saving=service.saveEvent('DRAFT');
    service.resetEventForm(false);
    created.next({id:'old-saved-event'});created.complete();await saving;
    expect(service.eventForm.controls.id.value).toBe('');
    expect(service.selectedEvent()).toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('refreshes the current scope identity after saving on the same scope URL', async () => {
    const context=TestBed.inject(EventWorkspaceContextService);
    context.context.set({kind:'event',id:'event-1',name:'Nome antigo',emoji:'📌'});
    service.eventForm.patchValue({id:'event-1',name:'Nome novo',emoji:'🧪'});
    api.getEvent.mockReturnValueOnce(of(createAdminEvent({id:'event-1',name:'Nome novo',emoji:'🧪'})));
    await service.saveEvent('PUBLISH');
    expect(context.context()).toEqual(expect.objectContaining({id:'event-1',name:'Nome novo',emoji:'🧪'}));
  });

  it('creates a fresh event under the group direct parent without changing the previously selected event', async () => {
    const group = createAdminEventGroup({id:'parent-group',majorEventId:'parent-major',name:'Trilha',emoji:'🌐'});
    vi.mocked(TestBed.inject(EventGroupApiService).getEventGroup).mockReturnValueOnce(of(group));
    majorEventApi.getMajorEvent.mockReturnValue(of(createAdminMajorEvent({id:'parent-major',name:'Semana',emoji:'🎓'})));
    service.selectedEvent.set(createAdminEvent({id:'old-event'}));
    service.eventForm.controls.id.setValue('old-event');
    const parents = await service.initializeNewEvent({eventGroupId:'parent-group'});
    expect(service.selectedEvent()).toBeNull();
    expect(service.eventForm.controls.id.value).toBe('');
    expect(service.eventForm.controls.majorEventId.value).toBe('parent-major');
    expect(service.eventForm.controls.eventGroupId.value).toBe('parent-group');
    expect(parents.map((parent)=>parent.emoji)).toEqual(['🎓','🌐']);
    expect(router.navigate).not.toHaveBeenCalled();
    await service.saveEvent('DRAFT');
    expect(api.createEvent).toHaveBeenCalledWith(expect.objectContaining({majorEventId:'parent-major',eventGroupId:'parent-group'}));
    expect(api.updateEvent).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/event-workspace', 'event', 'event-1', 'settings']);
  });

  it('ignores a prior event whose group metadata arrives after another selection', async () => {
    const group = new Subject<ReturnType<typeof createAdminEventGroup>>();
    vi.mocked(TestBed.inject(EventGroupApiService).getEventGroup).mockReturnValueOnce(group);
    api.getEvent.mockImplementation((id:string)=>of(createAdminEvent({id,name:id,eventGroupId:id==='a'?'group-a':null,eventGroup:null,locationDescription:''})));
    const first = service.selectEventById('a',{forceOriginal:true});
    await flushAsync();
    await service.selectEventById('b',{forceOriginal:true});
    group.next(createAdminEventGroup({id:'group-a'}));group.complete();
    await expect(first).resolves.toBe(false);
    expect(service.selectedEvent()?.id).toBe('b');
    expect(service.eventForm.controls.id.value).toBe('b');
    expect(service.eventForm.controls.eventGroupId.value).toBe('');
  });

  it('does not apply creation parent metadata after a later reset', async () => {
    const major = new Subject<ReturnType<typeof createAdminMajorEvent>>();
    majorEventApi.getMajorEvent.mockReturnValueOnce(major);
    const pending = service.initializeNewEvent({majorEventId:'old-parent'});
    service.resetEventForm(false);
    major.next(createAdminMajorEvent({id:'old-parent'}));major.complete();
    await pending;
    expect(service.eventForm.controls.majorEventId.value).toBe('');
    expect(service.selectedEvent()).toBeNull();
  });

  it('saves the selected regular attendance tiers and clears them when changing major events', async () => {
    const majorEvent = createAdminMajorEvent({
      id: 'major-event-1',
      majorEventPrices: [
        {
          id: 'price',
          type: 'TIERED',
          tiers: [{ id: 'kit-tier', name: 'Com kit', value: 5000, includesSportsRegistration: false }],
        },
      ],
    });
    majorEventApi.getMajorEvent.mockReturnValue(of(majorEvent));
    service.assignMajorEventToEvent(majorEvent);
    await Promise.resolve();
    expect(service.attendancePriceTiers().map((tier) => tier.id)).toEqual(['kit-tier']);
    service.eventForm.controls.regularAttendancePriceTierIds.setValue(['kit-tier']);

    await service.saveEvent('DRAFT');

    expect(lastPayload).toMatchObject({ regularAttendancePriceTierIds: ['kit-tier'] });
    service.assignMajorEventToEvent(createAdminMajorEvent({ id: 'other-major-event' }));
    expect(service.eventForm.controls.regularAttendancePriceTierIds.value).toEqual([]);
  });

  it('keeps a reversed event range in the browser instead of sending it to the API', async () => {
    service.eventForm.patchValue({
      startDate: '2026-05-21T16:00',
      endDate: '2026-05-21T14:00',
    });

    await service.saveEvent('DRAFT');

    expect(service.eventForm.hasError('eventDateRange')).toBe(true);
    expect(api.createEvent).not.toHaveBeenCalled();
    expect(api.saveEventDraft).not.toHaveBeenCalled();
  });

  it('keeps online attendance fields disabled until the event allows online attendance', () => {
    const code = service.eventForm.controls.onlineAttendanceCode;
    const startsAt = service.eventForm.controls.onlineAttendanceStartDate;
    const endsAt = service.eventForm.controls.onlineAttendanceEndDate;

    expect(code.disabled).toBe(true);
    expect(startsAt.disabled).toBe(true);
    expect(endsAt.disabled).toBe(true);

    service.eventForm.controls.isOnlineAttendanceAllowed.setValue(true);
    expect(code.enabled).toBe(true);
    expect(startsAt.enabled).toBe(true);
    expect(endsAt.enabled).toBe(true);

    service.eventForm.controls.isOnlineAttendanceAllowed.setValue(false);
    expect(code.disabled).toBe(true);
    expect(startsAt.disabled).toBe(true);
    expect(endsAt.disabled).toBe(true);
  });

  it('does not publish an event while required editor fields are invalid', async () => {
    service.eventForm.controls.name.setValue('');

    await service.saveEvent('PUBLISH');

    expect(api.createEvent).not.toHaveBeenCalled();
    expect(api.updateEvent).not.toHaveBeenCalled();
    expect(service.eventForm.controls.name.touched).toBe(true);
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

  it('persists independent interest and attendance eligibility settings', async () => {
    service.eventForm.patchValue({
      interestEnabled: true,
      attendanceEligibility: 'ANYONE',
    });

    await service.saveEvent('DRAFT');

    expect(lastPayload).toMatchObject({
      interestEnabled: true,
      attendanceEligibility: 'ANYONE',
    });
  });

  it('serializes the selected audience people and course restriction at save time', async () => {
    service.eventForm.patchValue({ audience: 'PUBLIC', audienceCourseCodes: ['12'] });
    service.setEventAudienceInvitations([{ id: 'person-1', name: 'Ana', email: 'ana@example.com' }]);

    await service.saveEvent('DRAFT');

    expect(lastPayload).toMatchObject({
      audience: 'PUBLIC',
      audienceCourseCodes: [],
      invitationPersonIds: ['person-1'],
    });

    service.eventForm.patchValue({ audience: 'COURSE_ONLY', audienceCourseCodes: ['12'] });
    service.setEventAudienceInvitations([{ id: 'person-1', name: 'Ana', email: 'ana@example.com' }]);
    await service.saveEvent('DRAFT');

    expect(lastPayload).toMatchObject({
      audience: 'COURSE_ONLY',
      audienceCourseCodes: ['12'],
      invitationPersonIds: ['person-1'],
    });
  });

  it('repairs a malformed course-only form before saving', async () => {
    service.eventForm.patchValue({ audience: 'COURSE_ONLY', audienceCourseCodes: [] });

    await service.saveEvent('DRAFT');

    expect(lastPayload).toMatchObject({ audience: 'COURSE_ONLY', audienceCourseCodes: ['12'] });
  });

  it('keeps invitation-only attendance independent of access audience and publication readiness', async () => {
    service.eventForm.patchValue({
      audience: 'PUBLIC',
      attendanceEligibility: 'INVITED_ONLY',
    });

    expect(service.shouldManageAttendanceInvitations()).toBe(true);
    expect(service.audiencePublicationBlocked()).toBe(true);
    await service.saveEvent('PUBLISH');
    expect(api.createEvent).not.toHaveBeenCalled();

    await service.saveEvent('DRAFT');
    expect(api.createEvent).toHaveBeenCalled();
  });

  it('hydrates every recipient when reopening a draft', async () => {
    grantedPermissions.add(Permission.Person.Read);
    const draft = createAdminEventDraft(
      { id: 'event-draft-1' },
      { audience: 'PUBLIC', invitationPersonIds: ['person-new'], name: 'Rascunho com convite' },
    );
    api.getEvent.mockReturnValueOnce(of(createAdminEvent({ audienceInvitations: [] })));
    api.listEventDrafts.mockReturnValueOnce(of([draft]));

    await service.selectEventById('event-1', { draftId: draft.id });

    expect(peopleApi.getPerson).toHaveBeenCalledWith('person-new');
    expect(service.eventAudienceInvitations()).toEqual([
      { id: 'person-new', name: 'Pessoa do rascunho', email: null },
    ]);
  });

  it('preserves recipients when draft metadata lookup is forbidden', async () => {
    grantedPermissions.add(Permission.Person.Read);
    peopleApi.getPerson.mockReturnValueOnce(throwError(() => new Error('Forbidden')));
    const draft = createAdminEventDraft(
      { id: 'event-draft-1' },
      { audience: 'PUBLIC', invitationPersonIds: ['person-forbidden'], name: 'Rascunho protegido' },
    );
    api.getEvent.mockReturnValueOnce(of(createAdminEvent({ audienceInvitations: [] })));
    api.listEventDrafts.mockReturnValueOnce(of([draft]));

    await service.selectEventById('event-1', { draftId: draft.id });

    expect(service.eventAudienceInvitations()).toEqual([
      {
        id: 'person-forbidden',
        name: 'Pessoa convidada (dados indisponíveis)',
        email: null,
        unresolved: true,
      },
    ]);
    await service.saveEvent('DRAFT');
    expect(lastPayload?.invitationPersonIds).toEqual(['person-forbidden']);
  });

  it('keeps an invitation list when an event group is reassigned', () => {
    const group = createAdminEventGroup({ id: 'event-group-2', name: 'Grupo novo', audience: 'UNESP_ONLY' });

    service.assignEventGroupToEvent(group);

    expect(service.audienceParentRestrictions()).toEqual([
      expect.objectContaining({ label: 'Grupo “Grupo novo”', audience: 'UNESP_ONLY' }),
    ]);
  });

  it('prefills an event major parent when assigning a group with an explicit parent', () => {
    const group = createAdminEventGroup({ id: 'event-group-2', majorEventId: 'major-event-1' });

    service.assignEventGroupToEvent(group);

    expect(service.eventForm.controls.majorEventId.value).toBe('major-event-1');
    expect(service.majorEventNameById('major-event-1')).toBe('Grande evento');
    expect(service.eventForm.controls.eventGroupId.value).toBe('event-group-2');
  });

  it('rejects assigning a group from a different major event', () => {
    service.eventForm.controls.majorEventId.setValue('major-event-2');
    const group = createAdminEventGroup({ id: 'event-group-2', majorEventId: 'major-event-1' });

    service.assignEventGroupToEvent(group);

    expect(service.eventForm.controls.eventGroupId.value).toBe('');
    expect(feedback.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('outro grande evento') }),
      'Não foi possível vincular o grupo ao evento.',
    );
  });

  it('allows private drafts without invitations but blocks publication readiness', async () => {
    service.eventForm.patchValue({ audience: 'INVITATION_ONLY' });

    expect(service.audiencePublicationBlocked()).toBe(true);
    await service.saveEvent('PUBLISH');
    expect(api.createEvent).not.toHaveBeenCalled();

    await service.saveEvent('DRAFT');
    expect(api.createEvent).toHaveBeenCalled();
  });

  it('describes major-event and group audience restrictions for a nested event', () => {
    const majorEvent = createAdminMajorEvent({
      id: 'major-event-1',
      audience: 'UNESP_ONLY',
    });
    const eventGroup = createAdminEventGroup({
      id: 'event-group-1',
      name: 'Grupo Unesp',
      audience: 'COURSE_ONLY',
      audienceCourseCodes: ['12'],
    });
    service.selectedEvent.set(
      createAdminEvent({
        majorEventId: majorEvent.id,
        majorEvent,
        eventGroupId: eventGroup.id,
        eventGroup,
      }),
    );
    service.eventForm.patchValue({ majorEventId: majorEvent.id, eventGroupId: eventGroup.id });

    expect(service.audienceParentRestrictions()).toEqual([
      expect.objectContaining({ audience: 'UNESP_ONLY' }),
      expect.objectContaining({ audience: 'COURSE_ONLY', audienceCourseCodes: ['12'] }),
    ]);
  });

  it('persists both certificate exception flags when event certificates are enabled', async () => {
    service.eventForm.patchValue({
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: true,
      shouldIssueCertificateForNonSubscribedAttendees: true,
    });

    await service.saveEvent('DRAFT');

    expect(lastPayload).toMatchObject({
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: true,
      shouldIssueCertificateForNonSubscribedAttendees: true,
    });
  });

  it('disables event certificate exceptions denied by the selected group', () => {
    service.selectedEventGroupAllowsNonPayingCertificates.set(false);
    service.selectedEventGroupAllowsNonSubscribedCertificates.set(false);
    service.eventForm.controls.shouldIssueCertificate.setValue(true);

    expect(service.eventForm.controls.shouldIssueCertificateForNonPayingAttendees.disabled).toBe(true);
    expect(service.eventForm.controls.shouldIssueCertificateForNonSubscribedAttendees.disabled).toBe(true);
    expect(service.eventForm.controls.shouldIssueCertificateForNonPayingAttendees.value).toBe(false);
    expect(service.eventForm.controls.shouldIssueCertificateForNonSubscribedAttendees.value).toBe(false);
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

    expect(api.updateEvent).toHaveBeenCalledWith('event-1', expect.objectContaining({ publishAfterUpdate: true }));
    expect(publicationApi.setPublicationState).not.toHaveBeenCalled();
  });

  it('saves the lecturer profile visibility toggle in event payloads', async () => {
    service.eventForm.controls.displayLecturerProfile.setValue(false);

    await service.saveEvent('DRAFT');

    expect(lastPayload).toMatchObject({
      displayLecturerProfile: false,
    });
  });

  it('normalizes pasted YouTube and Twitch URLs before saving an event', async () => {
    service.eventForm.patchValue({
      youtubeCode: 'https://www.youtube.com/watch?v=Video_123',
      twitchChannel: 'https://www.twitch.tv/CanalFct',
    });
    service.normalizeYoutubeCodeInput();
    service.normalizeTwitchChannelInput();
    expect(service.eventForm.controls.youtubeCode.value).toBe('Video_123');
    expect(service.eventForm.controls.twitchChannel.value).toBe('canalfct');

    await service.saveEvent('DRAFT');

    expect(lastPayload).toMatchObject({ youtubeCode: 'Video_123', twitchChannel: 'canalfct' });
  });

  it('keeps invalid livestream input visible and blocks saving it', async () => {
    const invalidYoutubeUrl = 'https://example.com/not-a-video';
    service.eventForm.controls.youtubeCode.setValue(invalidYoutubeUrl);

    await service.saveEvent('DRAFT');

    expect(service.eventForm.controls.youtubeCode.value).toBe(invalidYoutubeUrl);
    expect(service.eventForm.controls.youtubeCode.hasError('invalidYoutubeCode')).toBe(true);
    expect(service.eventForm.controls.youtubeCode.touched).toBe(true);
    expect(api.createEvent).not.toHaveBeenCalled();
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
    const selectedDraft = createAdminEventDraft(
      { id: 'event-draft-1', sourceEventId: 'event-1' },
      { name: 'Rascunho' },
    );
    api.listEventAttendanceCollectors.mockReturnValue(
      of([{ eventId: 'event-1', personId: person.id, person, createdAt: '2026-05-21T12:00:00.000Z' }]),
    );
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
    const placePresets = TestBed.inject(PlacePresetsService);
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
    const placePresets = TestBed.inject(PlacePresetsService);
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
    const placePresets = TestBed.inject(PlacePresetsService);
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
    const placePresets = TestBed.inject(PlacePresetsService);
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
    const placePresets = TestBed.inject(PlacePresetsService);
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
