import { signal } from '@angular/core';
import { EventWorkspaceContextService } from '../event-workspace/event-workspace-context.service';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { EventApiService } from '../graphql/event-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { MajorEventInput } from '@cacic-fct/event-manager-admin-contracts';
import { PublicationApiService } from '../graphql/publishing-api.service';
import { createAdminEvent, createAdminMajorEventFromInput } from '../testing/admin-entity-fixtures';
import { MajorEventsService } from './major-events.service';
import { PermissionsService } from '../permissions/permissions.service';

describe('MajorEventsService', () => {
  let service: MajorEventsService;
  let lastPayload: MajorEventInput | null;
  let publicationApi: {
    setPublicationState: ReturnType<typeof vi.fn>;
  };
  let router: {
    navigate: ReturnType<typeof vi.fn>;
  };
  let dialog: {
    open: ReturnType<typeof vi.fn>;
  };
  let api: {
    createMajorEvent: ReturnType<typeof vi.fn>;
    getMajorEvent: ReturnType<typeof vi.fn>;
    updateMajorEvent: ReturnType<typeof vi.fn>;
    listMajorEvents: ReturnType<typeof vi.fn>;
  };
  let eventApi: {
    listEvents: ReturnType<typeof vi.fn>;
    updateEvent: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    lastPayload = null;
    api = {
      createMajorEvent: vi.fn((payload: MajorEventInput) => {
        lastPayload = payload;
        return of(createAdminMajorEventFromInput(payload));
      }),
      getMajorEvent: vi.fn(),
      updateMajorEvent: vi.fn((id: string, payload: MajorEventInput) => {
        lastPayload = payload;
        return of(createAdminMajorEventFromInput({ ...payload, id }));
      }),
      listMajorEvents: vi.fn(() => of([])),
    };
    eventApi = {
      listEvents: vi.fn(() => of([])),
      updateEvent: vi.fn(() => of(createAdminEvent())),
    };
    publicationApi = {
      setPublicationState: vi.fn(() => of({ ok: true })),
    };
    router = {
      navigate: vi.fn(),
    };
    dialog = {
      open: vi.fn(() => ({ afterClosed: () => of(undefined) })),
    };

    await TestBed.configureTestingModule({
      providers: [
        MajorEventsService,
        { provide: EventWorkspaceContextService, useValue: { context: signal(null) } },
        { provide: MajorEventApiService, useValue: api },
        { provide: EventApiService, useValue: eventApi },
        { provide: PublicationApiService, useValue: publicationApi },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: Router, useValue: router },
        { provide: PermissionsService, useValue: { hasAll: vi.fn(() => true) } },
      ],
    }).compileComponents();

    service = TestBed.inject(MajorEventsService);
    service.majorEventForm.patchValue({
      name: 'SECOMPP26',
      emoji: '😀',
      startDate: '2026-05-15T00:00',
      endDate: '2026-05-20T00:00',
      isPaymentRequired: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks semantic major-event editor changes from a clean baseline', () => {
    service.resetMajorEventForm(false);
    expect(service.unsavedChanges()).toBe(false);
    service.majorEventForm.controls.name.setValue('Nome alterado');
    expect(service.unsavedChanges()).toBe(true);
    service.resetMajorEventForm(false);
    expect(service.unsavedChanges()).toBe(false);
  });

  it('keeps the newest selected major event when an earlier lookup completes later', async () => {
    const delayed=new Subject<ReturnType<typeof createAdminMajorEventFromInput>>();
    api.getMajorEvent.mockReturnValueOnce(delayed).mockReturnValueOnce(of(createAdminMajorEventFromInput({id:'b'})));
    const first=service.pickMajorEventById('a');await service.pickMajorEventById('b');
    delayed.next(createAdminMajorEventFromInput({id:'a'}));delayed.complete();await first;
    expect(service.selectedMajorEvent()?.id).toBe('b');expect(service.majorEventForm.controls.id.value).toBe('b');
  });

  it('cancels pending selection when initializing a fresh major event without navigation', async () => {
    const delayed=new Subject<ReturnType<typeof createAdminMajorEventFromInput>>();
    api.getMajorEvent.mockReturnValueOnce(delayed);
    const first=service.pickMajorEventById('a');service.resetMajorEventForm(false);
    delayed.next(createAdminMajorEventFromInput({id:'a'}));delayed.complete();await first;
    expect(service.selectedMajorEvent()).toBeNull();expect(service.majorEventForm.controls.id.value).toBe('');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not navigate to a saved major event after its child list finishes for a newer selection', async () => {
    const delayedEvents = new Subject<ReturnType<typeof createAdminEvent>[]>();
    eventApi.listEvents.mockReturnValueOnce(delayedEvents);

    const save = service.saveMajorEvent('DRAFT');
    await vi.waitFor(() => expect(eventApi.listEvents).toHaveBeenCalledWith({ majorEventId: 'major-event-1', take: 200 }));
    service.resetMajorEventForm(false);
    delayedEvents.next([]);
    delayedEvents.complete();
    await save;

    expect(router.navigate).not.toHaveBeenCalledWith(['/event-workspace', 'major-event', 'major-event-1', 'settings']);
    expect(service.selectedMajorEvent()).toBeNull();
  });

  it('keeps a reversed major-event range in the browser instead of sending it to the API', async () => {
    service.majorEventForm.patchValue({
      startDate: '2026-05-20T00:00',
      endDate: '2026-05-15T00:00',
    });

    await service.saveMajorEvent('DRAFT');

    expect(service.majorEventForm.hasError('majorEventDateRange')).toBe(true);
    expect(api.createMajorEvent).not.toHaveBeenCalled();
  });

  it('searches major events from the first page and retains the query during pagination', async () => {
    service.majorEventsPagination.pageIndex.set(3);
    service.majorEventsSearchForm.controls.query.setValue('  Semana  ', { emitEvent: false });
    await service.searchMajorEvents();
    expect(service.majorEventsPagination.pageIndex()).toBe(0);
    expect(api.listMajorEvents).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'Semana', skip: 0 }));
    service.majorEventsPagination.pageIndex.set(1);
    await service.loadMajorEvents();
    expect(api.listMajorEvents).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'Semana' }));
  });

  it('keeps the latest search results when a previous request finishes later', async () => {
    const oldResults = new Subject<ReturnType<typeof createAdminMajorEventFromInput>[]>();
    api.listMajorEvents.mockReturnValueOnce(oldResults);
    const oldRequest = service.searchMajorEvents();
    const latest = createAdminMajorEventFromInput({ id: 'latest-major-event', name: 'Mais recente' });
    api.listMajorEvents.mockReturnValueOnce(of([latest]));
    await service.searchMajorEvents();
    oldResults.next([createAdminMajorEventFromInput({ id: 'old-major-event' })]);
    oldResults.complete();
    await oldRequest;
    expect(service.majorEvents().map((event) => event.id)).toEqual(['latest-major-event']);
  });

  it('posts a single price entered as a number input value', async () => {
    service.priceTiers.at(0).controls.value.setValue(40 as unknown as string);

    await service.saveMajorEvent();

    expect(lastPayload?.price).toEqual({
      type: 'SINGLE',
      tiers: [{ name: 'Preço único', value: 4000 }],
    });
  });

  it('persists independent interest and explicit attendance eligibility settings', async () => {
    service.majorEventForm.patchValue({
      interestEnabled: true,
      attendanceEligibility: 'ANYONE',
    });

    await service.saveMajorEvent('DRAFT');

    expect(lastPayload).toMatchObject({
      interestEnabled: true,
      attendanceEligibility: 'ANYONE',
    });
  });

  it('serializes selected invitees for invitation-only major events', async () => {
    service.majorEventForm.patchValue({ audience: 'PUBLIC' });
    service.setMajorEventAudienceInvitations([{ id: 'person-1', name: 'Ana', email: 'ana@example.com' }]);

    await service.saveMajorEvent('DRAFT');

    expect(lastPayload).toMatchObject({
      audience: 'PUBLIC',
      audienceCourseCodes: [],
      invitationPersonIds: ['person-1'],
    });
  });

  it('keeps invitation-only attendance independent of access audience and publication readiness', async () => {
    service.majorEventForm.patchValue({
      audience: 'PUBLIC',
      attendanceEligibility: 'INVITED_ONLY',
    });

    expect(service.shouldManageAttendanceInvitations()).toBe(true);
    expect(service.audiencePublicationBlocked()).toBe(true);
    await service.saveMajorEvent('PUBLISH');
    expect(api.createMajorEvent).not.toHaveBeenCalled();

    await service.saveMajorEvent('DRAFT');
    expect(api.createMajorEvent).toHaveBeenCalled();
  });

  it('repairs a malformed course-only form before saving', async () => {
    service.majorEventForm.patchValue({ audience: 'COURSE_ONLY', audienceCourseCodes: [] });

    await service.saveMajorEvent('DRAFT');

    expect(lastPayload).toMatchObject({ audienceCourseCodes: ['12'] });
  });

  it('persists certificate exception flags and disables non-paying certificates for paid events', async () => {
    expect(service.majorEventForm.controls.shouldIssueCertificateForNonPayingAttendees.disabled).toBe(true);
    service.majorEventForm.patchValue({
      shouldIssueCertificateForNonPayingAttendees: true,
      shouldIssueCertificateForNonSubscribedAttendees: true,
    });

    await service.saveMajorEvent('DRAFT');

    expect(lastPayload).toMatchObject({
      shouldIssueCertificateForNonPayingAttendees: false,
      shouldIssueCertificateForNonSubscribedAttendees: true,
    });

    service.majorEventForm.controls.isPaymentRequired.setValue(false);
    service.majorEventForm.controls.shouldIssueCertificateForNonPayingAttendees.setValue(true);
    await service.saveMajorEvent('DRAFT');

    expect(lastPayload?.shouldIssueCertificateForNonPayingAttendees).toBe(true);
  });

  it('serializes an event-disabled tier while leaving the default-enabled value omitted', async () => {
    service.priceTiers.at(0).controls.value.setValue('40');
    service.priceTiers.at(0).controls.includesEventRegistration.setValue(false);

    await service.saveMajorEvent();

    expect(lastPayload?.price).toEqual({
      type: 'SINGLE',
      tiers: [{ name: 'Preço único', value: 4000, includesEventRegistration: false }],
    });
  });

  it('searches events for a selected major event as the query changes', async () => {
    vi.useFakeTimers();
    service.selectedMajorEvent.set(createAdminMajorEventFromInput({ id: 'major-event-1' }));
    eventApi.listEvents.mockReturnValueOnce(
      of([createAdminEvent({ id: 'event-1', name: 'Aula', majorEventId: null })]),
    );

    service.majorEventEventSearchForm.controls.query.setValue('aula');

    await vi.advanceTimersByTimeAsync(250);

    expect(eventApi.listEvents).toHaveBeenCalledWith({ query: 'aula', take: 20 });
    expect(service.majorEventEventSearchResults().map((eventItem) => eventItem.id)).toEqual(['event-1']);
  });

  it('posts tiered participant prices', async () => {
    service.majorEventForm.controls.priceType.setValue('TIERED');
    service.priceTiers.at(0).patchValue({ name: 'Aluno', value: '40' });
    service.addPriceTier();
    service.priceTiers.at(1).patchValue({ name: 'Professor', value: '60.50' });

    await service.saveMajorEvent();

    expect(lastPayload?.price).toEqual({
      type: 'TIERED',
      tiers: [
        { name: 'Aluno', value: 4000 },
        { name: 'Professor', value: 6050 },
      ],
    });
  });

  it('persists sports registration only for a price tier on a linked tournament', async () => {
    const majorEvent = createAdminMajorEventFromInput({ id: 'major-event-1' });
    majorEvent.sportsTournament = { id: 'tournament-1' };
    service.selectedMajorEvent.set(majorEvent);
    service.majorEventForm.controls.id.setValue(majorEvent.id);
    service.priceTiers.at(0).controls.value.setValue('70');
    service.priceTiers.at(0).controls.includesSportsRegistration.setValue(true);

    await service.saveMajorEvent();

    expect(lastPayload?.price).toEqual({
      type: 'SINGLE',
      tiers: [{ name: 'Preço único', value: 7000, includesSportsRegistration: true }],
    });
  });

  it('moves saved major events to draft on draft saves', async () => {
    await service.saveMajorEvent('DRAFT');

    expect(publicationApi.setPublicationState).toHaveBeenCalledWith({
      targetType: 'MAJOR_EVENT',
      targetId: 'major-event-1',
      state: 'DRAFT',
    });
  });

  it('publishes saved major events on publish saves', async () => {
    await service.saveMajorEvent('PUBLISH');

    expect(publicationApi.setPublicationState).toHaveBeenCalledWith({
      targetType: 'MAJOR_EVENT',
      targetId: 'major-event-1',
      state: 'PUBLISHED',
    });
  });

  it('publishes existing major-event edits in the update mutation without a second publication mutation', async () => {
    service.majorEventForm.controls.id.setValue('major-event-1');

    await service.saveMajorEvent('PUBLISH');

    expect(api.updateMajorEvent).toHaveBeenCalledWith(
      'major-event-1',
      expect.objectContaining({ publishAfterUpdate: true }),
    );
    expect(publicationApi.setPublicationState).not.toHaveBeenCalled();
  });

  it('moves schedule saves to draft and navigates to publication scheduling', async () => {
    await service.saveMajorEvent('SCHEDULE');

    expect(publicationApi.setPublicationState).toHaveBeenCalledWith({
      targetType: 'MAJOR_EVENT',
      targetId: 'major-event-1',
      state: 'DRAFT',
    });
    expect(router.navigate).toHaveBeenCalledWith(['/publication', 'major-event', 'major-event-1']);
  });

  it('preserves the saved id when publication state update fails after create', async () => {
    publicationApi.setPublicationState.mockReturnValueOnce(throwError(() => new Error('Publication state failed')));

    await service.saveMajorEvent('PUBLISH');

    expect(api.createMajorEvent).toHaveBeenCalled();
    expect(service.majorEventForm.controls.id.value).toBe('major-event-1');
  });

  it('explains that sports tournaments use their dedicated clone workflow', async () => {
    await service.cloneMajorEvent(createAdminMajorEventFromInput({ id: 'major-event-1', name: 'Jogos CACiC' }));

    expect(dialog.open).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        data: expect.objectContaining({
          parts: expect.arrayContaining([
            expect.objectContaining({
              key: 'sportsTournament',
              label: 'Torneio esportivo',
              disabled: true,
              disabledReason: expect.stringContaining('"Duplicar torneio" na gestão esportiva'),
            }),
          ]),
        }),
      }),
    );
  });

  it('loads the stored single price into the edit form', async () => {
    api.getMajorEvent.mockReturnValue(
      of(
        createAdminMajorEventFromInput({
          id: 'major-event-1',
          name: 'SECOMPP26',
          emoji: '😀',
          startDate: '2026-05-15T03:00:00.000Z',
          endDate: '2026-05-20T03:00:00.000Z',
          isPaymentRequired: true,
          price: {
            type: 'SINGLE',
            tiers: [{ name: 'Preço único', value: 3000 }],
          },
        }),
      ),
    );

    await service.pickMajorEventById('major-event-1');

    expect(service.majorEventForm.controls.priceType.value).toBe('SINGLE');
    expect(service.priceTiers.length).toBe(1);
    expect(service.priceTiers.at(0).getRawValue()).toEqual({
      id: 'major-event-1-price-tier-1',
      name: 'Preço único',
      value: '30.00',
      includesEventRegistration: true,
      includesSportsRegistration: false,
    });
  });

  it('loads the stored tiered prices into the edit form', async () => {
    api.getMajorEvent.mockReturnValue(
      of(
        createAdminMajorEventFromInput({
          id: 'major-event-1',
          name: 'SECOMPP26',
          emoji: '😀',
          startDate: '2026-05-15T03:00:00.000Z',
          endDate: '2026-05-20T03:00:00.000Z',
          isPaymentRequired: true,
          price: {
            type: 'TIERED',
            tiers: [
              { name: 'Aluno', value: 3000 },
              { name: 'Professor', value: 6050 },
            ],
          },
        }),
      ),
    );

    await service.pickMajorEventById('major-event-1');

    expect(service.majorEventForm.controls.priceType.value).toBe('TIERED');
    expect(service.priceTiers.getRawValue()).toEqual([
      {
        id: 'major-event-1-price-tier-1',
        name: 'Aluno',
        value: '30.00',
        includesEventRegistration: true,
        includesSportsRegistration: false,
      },
      {
        id: 'major-event-1-price-tier-2',
        name: 'Professor',
        value: '60.50',
        includesEventRegistration: true,
        includesSportsRegistration: false,
      },
    ]);

    await service.saveMajorEvent();

    expect(lastPayload?.price?.tiers).toEqual([
      { id: 'major-event-1-price-tier-1', name: 'Aluno', value: 3000 },
      { id: 'major-event-1-price-tier-2', name: 'Professor', value: 6050 },
    ]);
  });
});
