import { DOCUMENT } from '@angular/common';
import { signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { parseDateOnly } from '@cacic-fct/shared-utils';
import { Subject, of, throwError } from 'rxjs';
import {
  adminFixtureDateFromNow,
  createAdminEvent,
  createAdminMajorEvent,
  createAdminPerson,
  createAdminWorkspaceEventSubscription,
  createAdminWorkspaceMajorEventSubscription,
} from '../testing/admin-entity-fixtures';
import { AttendanceApiService } from '../graphql/attendance-api.service';
import { EventApiService } from '../graphql/event-api.service';
import { PeopleApiService } from '../graphql/people-api.service';
import { SubscriptionApiService } from '../graphql/subscription-api.service';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { MajorEventsService } from '../major-events/major-events.service';
import { AttendancesService } from '../attendances/attendances.service';
import { PermissionsService } from '../permissions/permissions.service';
import { RealtimeApiService } from '../graphql/realtime-api.service';
import { flushAsync } from '../testing/async-test-helpers';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let api: {
    listEventSubscriptions: ReturnType<typeof vi.fn>;
    createEventSubscription: ReturnType<typeof vi.fn>;
    listMajorEventSubscriptions: ReturnType<typeof vi.fn>;
    getMajorEventSubscription: ReturnType<typeof vi.fn>;
    createMajorEventSubscription: ReturnType<typeof vi.fn>;
    updateMajorEventSubscription: ReturnType<typeof vi.fn>;
    majorEventSportsWorkspace: ReturnType<typeof vi.fn>;
    setSportsParticipantTeam: ReturnType<typeof vi.fn>;
    reviewSportsApplication: ReturnType<typeof vi.fn>;
    downloadEventSubscriptionBadgeArchive: ReturnType<typeof vi.fn>;
    downloadMajorEventSubscriptionBadgeArchive: ReturnType<typeof vi.fn>;
  };
  let eventApi: { listEvents: ReturnType<typeof vi.fn>; getEvent: ReturnType<typeof vi.fn> };
  let peopleApi: { listPeopleSummaries: ReturnType<typeof vi.fn> };
  let attendanceApi: { importMajorEventSubscriptionsFromCsv: ReturnType<typeof vi.fn> };
  let attendancesService: { refreshMajorEventUserAttendancesFor: ReturnType<typeof vi.fn> };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let snackBar: { open: ReturnType<typeof vi.fn> };
  let feedback: { error: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };
  let permissions: { has: ReturnType<typeof vi.fn> };
  let workspaceEvents: Subject<void>;

  const event = createAdminEvent({ id: 'event-1', name: 'Credenciamento', majorEventId: 'major-event-1' });
  const majorEvent = createAdminMajorEvent({ id: 'major-event-1', name: 'Semana' });
  const person = createAdminPerson({ id: 'person-1', name: 'Ada Lovelace' });
  const eventSubscription = createAdminWorkspaceEventSubscription({}, person, event);
  const majorSubscription = createAdminWorkspaceMajorEventSubscription({}, person, majorEvent);

  beforeEach(() => {
    api = {
      listEventSubscriptions: vi.fn(() => of([eventSubscription])),
      createEventSubscription: vi.fn(() => of(eventSubscription)),
      listMajorEventSubscriptions: vi.fn(() => of([majorSubscription])),
      getMajorEventSubscription: vi.fn(() => of(majorSubscription)),
      createMajorEventSubscription: vi.fn(() => of(majorSubscription)),
      updateMajorEventSubscription: vi.fn(() => of(majorSubscription)),
      majorEventSportsWorkspace: vi.fn(() => of(null)),
      setSportsParticipantTeam: vi.fn(() => of('ok')),
      reviewSportsApplication: vi.fn(() => of('ok')),
      downloadEventSubscriptionBadgeArchive: vi.fn(() => of({ blob: new Blob(['zip']), fileName: 'event.zip' })),
      downloadMajorEventSubscriptionBadgeArchive: vi.fn(() => of({ blob: new Blob(['zip']), fileName: 'major.zip' })),
    };
    eventApi = {
      listEvents: vi.fn(() => of([event])),
      getEvent: vi.fn(() => of(event)),
    };
    peopleApi = { listPeopleSummaries: vi.fn(() => of([person])) };
    attendanceApi = {
      importMajorEventSubscriptionsFromCsv: vi.fn(() =>
        of({
          createdSubscriptionCount: 1,
          updatedSubscriptionCount: 0,
          duplicateCount: 0,
          createdPeopleCount: 0,
          failedCount: 0,
          failedRows: [],
          createdPeople: [],
        }),
      ),
    };
    attendancesService = { refreshMajorEventUserAttendancesFor: vi.fn(() => Promise.resolve()) };
    dialog = { open: vi.fn(() => ({ afterClosed: () => of(null) })) };
    snackBar = { open: vi.fn() };
    feedback = { error: vi.fn() };
    router = { navigate: vi.fn() };
    permissions = { has: vi.fn(() => true) };
    workspaceEvents = new Subject<void>();

    TestBed.configureTestingModule({
      providers: [
        FormBuilder,
        SubscriptionsService,
        { provide: SubscriptionApiService, useValue: api },
        { provide: EventApiService, useValue: eventApi },
        { provide: PeopleApiService, useValue: peopleApi },
        { provide: AttendanceApiService, useValue: attendanceApi },
        { provide: AttendancesService, useValue: attendancesService },
        { provide: MajorEventsService, useValue: { majorEvents: signal([majorEvent]) } },
        { provide: PermissionsService, useValue: permissions },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: AdminFeedbackService, useValue: feedback },
        { provide: Router, useValue: router },
        { provide: DOCUMENT, useValue: document },
        {
          provide: RealtimeApiService,
          useValue: {
            watchWorkspace: vi.fn(() => workspaceEvents),
            watchEventSubscriptions: vi.fn(() => workspaceEvents),
            watchMajorEventSubscriptions: vi.fn(() => workspaceEvents),
          },
        },
      ],
    });

    service = TestBed.inject(SubscriptionsService);
  });

  it('searches and selects events, finds a person, creates a subscription, and refreshes attendance', async () => {
    await service.searchEvents();
    expect(eventApi.listEvents).toHaveBeenCalledWith({
      query: undefined,
      startDateFrom: undefined,
      startDateUntil: undefined,
      isInGroup: undefined,
      isInMajorEvent: undefined,
      skip: 0,
      take: 51,
    });

    await service.selectEvent(event);
    expect(router.navigate).toHaveBeenCalledWith(['/subscriptions/event', event.id]);
    expect(api.listEventSubscriptions).toHaveBeenCalledWith(event.id, { skip: 0, take: 51 });
    expect(service.eventSubscriptions()).toEqual([eventSubscription]);

    service.eventSubscriptionForm.patchValue({
      eventId: event.id,
      identifierType: 'email',
      identifier: person.email ?? '',
    });
    await service.findEventPerson();
    expect(peopleApi.listPeopleSummaries).toHaveBeenCalledWith({ email: person.email, take: 10 });

    await service.createEventSubscription(person);
    expect(api.createEventSubscription).toHaveBeenCalledWith({ eventId: event.id, personId: person.id });
    expect(attendancesService.refreshMajorEventUserAttendancesFor).toHaveBeenCalledWith('major-event-1');
    expect(snackBar.open).toHaveBeenCalledWith('Inscrição criada.', 'Fechar', { duration: 2500 });
  });

  it('reports event subscription creation errors without losing form state', async () => {
    service.eventSubscriptionForm.controls.eventId.setValue(event.id);
    api.createEventSubscription.mockReturnValueOnce(throwError(() => new Error('duplicate subscription')));

    await service.createEventSubscription(person);

    expect(feedback.error).toHaveBeenCalledWith(expect.any(Error), 'Não foi possível criar a inscrição.');
    expect(service.eventSubscriptionForm.controls.eventId.value).toBe(event.id);
  });

  it('refetches the selected event subscriptions after a live invalidation and stops after teardown', async () => {
    await service.selectEvent(event);
    const refreshed = createAdminWorkspaceEventSubscription({ id: 'event-subscription-2' }, person, event);
    api.listEventSubscriptions.mockClear();
    api.listEventSubscriptions.mockReturnValueOnce(of([refreshed]));

    workspaceEvents.next();
    await flushAsync();

    expect(api.listEventSubscriptions).toHaveBeenCalledOnce();
    expect(api.listEventSubscriptions).toHaveBeenCalledWith(event.id, { skip: 0, take: 51 });
    expect(service.eventSubscriptions()).toEqual([refreshed]);

    service.closeLiveUpdates();
    api.listEventSubscriptions.mockClear();
    workspaceEvents.next();
    await flushAsync();

    expect(api.listEventSubscriptions).not.toHaveBeenCalled();
  });

  it('stops the previous event stream before loading a new selection', async () => {
    await service.selectEvent(event);
    const nextEvent = createAdminEvent({ id: 'event-2', name: 'Encerramento' });
    const pendingSubscriptions = new Subject<(typeof eventSubscription)[]>();
    api.listEventSubscriptions.mockReturnValueOnce(pendingSubscriptions);

    const selection = service.selectEvent(nextEvent);
    await Promise.resolve();

    expect(workspaceEvents.observed).toBe(false);
    workspaceEvents.next();
    expect(api.listEventSubscriptions).toHaveBeenCalledTimes(2);

    pendingSubscriptions.next([]);
    pendingSubscriptions.complete();
    await selection;

    expect(workspaceEvents.observed).toBe(true);
  });

  it('loads major subscriptions, sports workspace, fallback events, filters, and paginates', async () => {
    await service.selectMajorEventById(majorEvent.id);

    expect(api.listMajorEventSubscriptions).toHaveBeenCalledWith(majorEvent.id, {
      query: undefined,
      skip: 0,
      take: 51,
    });
    expect(api.majorEventSportsWorkspace).toHaveBeenCalledWith(majorEvent.id);
    expect(service.majorEventEvents()).toEqual(majorSubscription.events);

    service.majorEventSubscriptionSearchForm.controls.query.setValue('Ada');
    await service.searchMajorEventSubscriptions();
    expect(api.listMajorEventSubscriptions).toHaveBeenLastCalledWith(majorEvent.id, {
      query: 'Ada',
      skip: 0,
      take: 51,
    });

    api.listMajorEventSubscriptions.mockReturnValueOnce(of([]));
    await service.loadMajorEventSubscriptions();
    expect(eventApi.listEvents).toHaveBeenCalledWith({ majorEventId: majorEvent.id, take: 200 });
  });

  it('refreshes major subscriptions from a live invalidation without overwriting an editor draft', async () => {
    await service.selectMajorEventById(majorEvent.id);
    service.selectMajorEventSubscription(majorSubscription, false);
    service.enableMajorEventEdit();
    service.majorEventEditForm.controls.paymentTier.setValue('Tier local');

    const refreshed = createAdminWorkspaceMajorEventSubscription(
      { id: majorSubscription.id, paymentTier: 'Tier remoto' },
      person,
      majorEvent,
    );
    api.listMajorEventSubscriptions.mockClear();
    api.listMajorEventSubscriptions.mockReturnValueOnce(of([refreshed]));

    workspaceEvents.next();
    await flushAsync();

    expect(api.listMajorEventSubscriptions).toHaveBeenCalledOnce();
    expect(api.listMajorEventSubscriptions).toHaveBeenCalledWith(majorEvent.id, {
      query: undefined,
      skip: 0,
      take: 51,
    });
    expect(service.majorEventSubscriptions()).toEqual([refreshed]);
    expect(service.selectedMajorEventSubscription()).toBe(majorSubscription);
    expect(service.majorEventEditForm.controls.paymentTier.value).toBe('Tier local');
    expect(service.editMode()).toBe(true);
  });

  it('tracks sports assignment selections and handles review cancellation, success, and failure', async () => {
    const application = {
      id: 'application-1',
      applicant: { personId: person.id, name: person.name },
      requestedTeam: { id: 'team-1', name: 'Equipe' },
      status: 'PENDING',
      categories: [],
    };
    const participant = {
      id: 'participant-1',
      person: person,
      source: 'SUBSCRIPTION',
      status: 'ACTIVE',
      paymentStatus: 'PAID',
      teams: [],
    };
    service.majorEventSportsWorkspace.set({
      tournamentId: 'tournament-1',
      teams: [],
      applications: [application],
      participants: [participant],
    } as never);
    service.setSportsAssignedTeam(application.id, 'team-2');
    service.setSportsParticipantTeamSelection(participant.id, 'team-2');
    expect(service.sportsAssignedTeamId(application.id)).toBe('team-2');
    expect(service.sportsParticipantTeamId(participant.id)).toBe('team-2');
    expect(service.sportsParticipantFor(person.id)).toBe(participant);
    expect(service.sportsParticipantsWithoutApplication()).toEqual([]);

    await service.saveSportsParticipantTeam(participant as never);
    expect(api.setSportsParticipantTeam).toHaveBeenCalledWith({ participantId: participant.id, teamId: 'team-2' });

    dialog.open.mockReturnValueOnce({ afterClosed: () => of(null) });
    await service.reviewSportsApplication(application as never, 'REJECTED');
    expect(api.reviewSportsApplication).not.toHaveBeenCalled();

    dialog.open.mockReturnValueOnce({ afterClosed: () => of('Explique o ajuste') });
    await service.reviewSportsApplication(application as never, 'CHANGES_REQUESTED');
    expect(api.reviewSportsApplication).toHaveBeenCalledWith({
      applicationId: application.id,
      decision: 'CHANGES_REQUESTED',
      assignedTeamId: undefined,
      reviewMessage: 'Explique o ajuste',
    });

    api.reviewSportsApplication.mockReturnValueOnce(throwError(() => new Error('review failed')));
    await service.reviewSportsApplication(application as never, 'APPROVED');
    expect(feedback.error).toHaveBeenCalledWith(expect.any(Error), 'Não foi possível revisar a inscrição esportiva.');
  });

  it('creates and updates major subscriptions with selected events and refreshes attendance', async () => {
    service.majorEventForm.controls.majorEventId.setValue(majorEvent.id);
    service.startNewMajorEventSubscription();
    service.selectMajorEventPerson(person);
    service.setSelectedEvent('event-1', true);
    service.majorEventEditForm.patchValue({
      subscriptionStatus: 'CONFIRMED',
      amountPaid: 1.2,
      paymentDate: parseDateOnly(adminFixtureDateFromNow(2).slice(0, 10)),
      paymentTier: 'Aluno',
      imageLicenseAgreementAccepted: true,
    });

    await service.saveMajorEventSubscription();
    expect(api.createMajorEventSubscription).toHaveBeenCalledWith({
      majorEventId: majorEvent.id,
      personId: person.id,
      subscriptionStatus: 'CONFIRMED',
      amountPaid: 120,
      paymentDate: adminFixtureDateFromNow(2).slice(0, 10),
      paymentTier: 'Aluno',
      imageLicenseAgreementAccepted: true,
      selectedEventIds: ['event-1'],
    });
    expect(attendancesService.refreshMajorEventUserAttendancesFor).toHaveBeenCalledWith(majorEvent.id);
    expect(snackBar.open).toHaveBeenCalledWith('Inscrição salva.', 'Fechar', { duration: 2500 });

    service.selectMajorEventSubscription(majorSubscription, false);
    service.enableMajorEventEdit();
    service.setSelectedEvent('event-2', true);
    await service.saveMajorEventSubscription();
    expect(api.updateMajorEventSubscription).toHaveBeenCalledWith(
      majorSubscription.id,
      expect.objectContaining({ selectedEventIds: expect.arrayContaining(['event-1', 'event-2']) }),
    );

    service.cancelMajorEventSubscriptionEdit();
    expect(service.editMode()).toBe(false);
  });

  it('converts stored cents to reais in the editor and back to cents when saving', async () => {
    const storedSubscription = createAdminWorkspaceMajorEventSubscription({ amountPaid: 4_000 });

    service.selectMajorEventSubscription(storedSubscription, false);

    expect(service.majorEventEditForm.controls.amountPaid.value).toBe(40);

    service.enableMajorEventEdit();
    service.majorEventEditForm.controls.amountPaid.setValue(40.5);
    await service.saveMajorEventSubscription();

    expect(api.updateMajorEventSubscription).toHaveBeenCalledWith(
      storedSubscription.id,
      expect.objectContaining({ amountPaid: 4_050 }),
    );
  });

  it('keeps all selected-subscription edits in a draft until the pencil enables saving', async () => {
    service.selectMajorEventSubscription(majorSubscription, false);

    expect(service.majorEventEditForm.disabled).toBe(true);
    expect(service.editMode()).toBe(false);

    service.toggleSelectedEvent('event-2');
    service.setSelectedEvent('event-2', true);
    service.selectMajorEventPerson(person);
    service.majorEventEditForm.controls.imageLicenseAgreementAccepted.setValue(true);
    await service.saveMajorEventSubscription();

    expect(service.selectedEventIds()).toEqual(new Set(['event-1']));
    expect(service.selectedMajorEventPerson()).toBeNull();
    expect(api.updateMajorEventSubscription).not.toHaveBeenCalled();

    service.majorEventEditForm.controls.imageLicenseAgreementAccepted.setValue(false);
    service.enableMajorEventEdit();
    expect(service.majorEventEditForm.enabled).toBe(true);

    service.setSelectedEvent('event-2', true);
    service.majorEventEditForm.controls.imageLicenseAgreementAccepted.setValue(true);
    await service.saveMajorEventSubscription();

    expect(api.updateMajorEventSubscription).toHaveBeenCalledWith(
      majorSubscription.id,
      expect.objectContaining({
        imageLicenseAgreementAccepted: true,
        selectedEventIds: expect.arrayContaining(['event-1', 'event-2']),
      }),
    );
  });

  it('reports missing-person major subscription validation and clears selection safely', async () => {
    service.majorEventForm.controls.majorEventId.setValue(majorEvent.id);
    service.startNewMajorEventSubscription();
    await service.saveMajorEventSubscription();

    expect(feedback.error).toHaveBeenCalledWith(expect.any(Error), 'Não foi possível salvar a inscrição.');
    service.closeMajorEventSubscriptionDetail();
    expect(service.selectedMajorEventSubscription()).toBeNull();
    expect(router.navigate).toHaveBeenLastCalledWith(['/subscriptions/major-event', majorEvent.id]);
  });

  it('imports major subscriptions with mapping, cancellation, missing-major validation, and errors', async () => {
    const file = csvFile('inscricoes.csv', 'email\nada@example.com');
    await service.importMajorEventSubscriptionsFromCsv(null);
    await service.importMajorEventSubscriptionsFromCsv(file);
    expect(snackBar.open).toHaveBeenCalledWith('Selecione um grande evento antes de importar.', 'Fechar', {
      duration: 3000,
    });

    service.majorEventForm.controls.majorEventId.setValue(majorEvent.id);
    dialog.open.mockReturnValueOnce({ afterClosed: () => of(null) });
    await service.importMajorEventSubscriptionsFromCsv(file);
    expect(attendanceApi.importMajorEventSubscriptionsFromCsv).not.toHaveBeenCalled();

    dialog.open.mockReturnValueOnce({
      afterClosed: () =>
        of({
          subscriptionStatus: 'CONFIRMED',
          columnMapping: { emailHeader: 'email', subscribedEventIdsHeader: 'eventos' },
        }),
    });
    await service.importMajorEventSubscriptionsFromCsv(file);
    expect(attendanceApi.importMajorEventSubscriptionsFromCsv).toHaveBeenCalledWith({
      majorEventId: majorEvent.id,
      csvContent: 'email\nada@example.com',
      subscriptionStatus: 'CONFIRMED',
      columnMapping: { emailHeader: 'email', subscribedEventIdsHeader: 'eventos' },
    });
    expect(service.isImportingCsv()).toBe(false);

    dialog.open.mockReturnValueOnce({
      afterClosed: () =>
        of({ subscriptionStatus: 'CONFIRMED', columnMapping: { subscribedEventIdsHeader: 'eventos' } }),
    });
    attendanceApi.importMajorEventSubscriptionsFromCsv.mockReturnValueOnce(throwError(() => new Error('CSV inválido')));
    await service.importMajorEventSubscriptionsFromCsv(file);
    expect(feedback.error).toHaveBeenCalledWith(expect.any(Error), 'Não foi possível importar o CSV.');
    expect(service.isImportingCsv()).toBe(false);
  });

  it('validates exports and supports export-dialog cancellation without downloading', async () => {
    await service.exportEventSubscriptionsCsv();
    expect(snackBar.open).toHaveBeenCalledWith('Selecione um evento antes de baixar o CSV.', 'Fechar', {
      duration: 3000,
    });

    service.selectedEvent.set(event);
    service.eventSubscriptionForm.controls.eventId.setValue(event.id);
    dialog.open.mockReturnValueOnce({ afterClosed: () => of(null) });
    await service.exportEventSubscriptionsCsv();
    expect(api.listEventSubscriptions).toHaveBeenCalledWith(event.id, { skip: 0, take: 1000 });

    await service.exportMajorEventSubscriptionsCsv();
    expect(snackBar.open).toHaveBeenCalledWith('Selecione um grande evento antes de baixar o CSV.', 'Fechar', {
      duration: 3000,
    });
  });
});

function csvFile(name: string, content: string): File {
  return { name, text: () => Promise.resolve(content) } as File;
}
