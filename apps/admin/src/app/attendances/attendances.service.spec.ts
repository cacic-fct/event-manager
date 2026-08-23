import { DOCUMENT } from '@angular/common';
import { signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AttendanceApiService } from '../graphql/attendance-api.service';
import { EventApiService } from '../graphql/event-api.service';
import { PeopleApiService } from '../graphql/people-api.service';
import {
  createAdminEvent,
  createAdminEventAttendance,
  createAdminMajorEvent,
  createAdminMajorEventUserAttendance,
  createAdminOfflineEventAttendanceSubmission,
  createAdminPerson,
} from '../testing/admin-entity-fixtures';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { MajorEventsService } from '../major-events/major-events.service';
import { AttendancesService } from './attendances.service';

describe('AttendancesService', () => {
  let service: AttendancesService;
  let api: {
    createEventAttendance: ReturnType<typeof vi.fn>;
    createEventAttendanceFromAztecCode: ReturnType<typeof vi.fn>;
    importEventAttendancesFromCsv: ReturnType<typeof vi.fn>;
    listEventAttendances: ReturnType<typeof vi.fn>;
    listEventAttendanceScannerFeed: ReturnType<typeof vi.fn>;
    getEventAttendanceCount: ReturnType<typeof vi.fn>;
    listOfflineEventAttendanceSubmissions: ReturnType<typeof vi.fn>;
    deleteEventAttendance: ReturnType<typeof vi.fn>;
    approveOfflineEventAttendanceSubmission: ReturnType<typeof vi.fn>;
    approveOfflineEventAttendanceSubmissions: ReturnType<typeof vi.fn>;
    rejectOfflineEventAttendanceSubmission: ReturnType<typeof vi.fn>;
    rejectOfflineEventAttendanceSubmissions: ReturnType<typeof vi.fn>;
    updateOfflineEventAttendanceSubmission: ReturnType<typeof vi.fn>;
    listMajorEventUserAttendances: ReturnType<typeof vi.fn>;
  };
  let eventApi: { listEvents: ReturnType<typeof vi.fn>; getEvent: ReturnType<typeof vi.fn> };
  let peopleApi: { listPeopleSummaries: ReturnType<typeof vi.fn> };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let snackBar: { open: ReturnType<typeof vi.fn> };
  let feedback: { error: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };

  const event = createAdminEvent({ id: 'event-1', name: 'Credenciamento' });
  const majorEvent = createAdminMajorEvent({ id: 'major-event-1', name: 'Semana' });
  const person = createAdminPerson({ id: 'person-1', name: 'Ada Lovelace' });

  beforeEach(() => {
    api = {
      createEventAttendance: vi.fn(() => of(createAdminEventAttendance({}, person, event))),
      createEventAttendanceFromAztecCode: vi.fn(() => of(createAdminEventAttendance({}, person, event))),
      importEventAttendancesFromCsv: vi.fn(() =>
        of({
          createdCount: 1,
          duplicateCount: 0,
          failedCount: 0,
          failedValues: [],
          inferredMatchType: 'EMAIL',
          ambiguousValues: [],
        }),
      ),
      listEventAttendances: vi.fn((_eventId: string, filters?: { status?: string }) =>
        of(filters?.status === 'ABSENT' ? [] : [createAdminEventAttendance({}, person, event)]),
      ),
      listEventAttendanceScannerFeed: vi.fn(() => of([{ personId: person.id, status: false }])),
      getEventAttendanceCount: vi.fn(() => of(1)),
      listOfflineEventAttendanceSubmissions: vi.fn(() => of([])),
      deleteEventAttendance: vi.fn(() => of({ deleted: true, id: person.id })),
      approveOfflineEventAttendanceSubmission: vi.fn(() => of({ id: 'offline-1', status: 'APPROVED' })),
      approveOfflineEventAttendanceSubmissions: vi.fn(() => of([])),
      rejectOfflineEventAttendanceSubmission: vi.fn(() => of({ id: 'offline-1', status: 'REJECTED' })),
      rejectOfflineEventAttendanceSubmissions: vi.fn(() => of([])),
      updateOfflineEventAttendanceSubmission: vi.fn(() =>
        of(createAdminOfflineEventAttendanceSubmission({ eventId: event.id }, event, person)),
      ),
      listMajorEventUserAttendances: vi.fn(() =>
        of([createAdminMajorEventUserAttendance({ majorEventId: majorEvent.id }, person, majorEvent)]),
      ),
    };
    eventApi = {
      listEvents: vi.fn(() => of([event])),
      getEvent: vi.fn(() => of(event)),
    };
    peopleApi = {
      listPeopleSummaries: vi.fn(() => of([person])),
    };
    dialog = {
      open: vi.fn(() => ({ afterClosed: () => of(null) })),
    };
    snackBar = { open: vi.fn() };
    feedback = { error: vi.fn() };
    router = { navigate: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        FormBuilder,
        AttendancesService,
        { provide: AttendanceApiService, useValue: api },
        { provide: EventApiService, useValue: eventApi },
        { provide: PeopleApiService, useValue: peopleApi },
        { provide: MajorEventsService, useValue: { majorEvents: signal([majorEvent]) } },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: AdminFeedbackService, useValue: feedback },
        { provide: Router, useValue: router },
        { provide: DOCUMENT, useValue: document },
      ],
    });

    service = TestBed.inject(AttendancesService);
  });

  it('searches, selects, finds people, registers, and deletes attendance with refetches', async () => {
    await service.searchAttendanceEvents();
    expect(eventApi.listEvents).toHaveBeenCalledWith({
      query: undefined,
      startDateFrom: undefined,
      startDateUntil: undefined,
      isInGroup: undefined,
      isInMajorEvent: undefined,
      skip: 0,
      take: 51,
    });

    service.attendanceForm.patchValue({ eventId: event.id, identifierType: 'email', identifier: 'ada@example.com' });
    await service.findAttendancePerson();
    expect(peopleApi.listPeopleSummaries).toHaveBeenCalledWith({ email: 'ada@example.com', take: 10 });
    expect(service.attendancePersonMatches()).toEqual([person]);

    await service.selectAttendanceEvent(event);
    expect(router.navigate).toHaveBeenCalledWith(['/attendances/event', event.id]);
    expect(service.attendances()).toHaveLength(1);

    await service.registerAttendance(person);
    expect(api.createEventAttendance).toHaveBeenCalledWith({ eventId: event.id, personId: person.id });
    expect(snackBar.open).toHaveBeenCalledWith('Presença registrada.', 'Fechar', { duration: 2500 });

    await service.deleteAttendance({ eventId: event.id, personId: person.id });
    expect(api.deleteEventAttendance).toHaveBeenCalledWith({ eventId: event.id, personId: person.id });
    expect(snackBar.open).toHaveBeenCalledWith('Presença removida.', 'Fechar', { duration: 2500 });
  });

  it('validates missing event/person input and scanner state before making mutations', async () => {
    await service.findAttendancePerson();
    expect(service.attendanceForm.controls.identifier.touched).toBe(true);
    expect(peopleApi.listPeopleSummaries).not.toHaveBeenCalled();

    await service.scanAttendance();
    expect(service.attendanceForm.controls.eventId.touched).toBe(true);
    expect(snackBar.open).toHaveBeenCalledWith('Selecione um evento antes de escanear.', 'Fechar', {
      duration: 3000,
    });

    await service.importAttendancesFromCsv(null);
    const file = csvFile('presencas.csv', 'email\nada@example.com');
    await service.importAttendancesFromCsv(file);
    expect(snackBar.open).toHaveBeenCalledWith('Selecione um evento antes de importar.', 'Fechar', {
      duration: 3000,
    });
    expect(api.importEventAttendancesFromCsv).not.toHaveBeenCalled();
  });

  it('processes scanner codes, reports scanner errors, and refreshes after scanner close', async () => {
    service.attendanceForm.controls.eventId.setValue(event.id);
    await service.processScannedCode(event.id, 'AZTEC-123');

    expect(api.createEventAttendanceFromAztecCode).toHaveBeenCalledWith({
      eventId: event.id,
      code: 'AZTEC-123',
    });
    expect(snackBar.open).toHaveBeenCalledWith('Presença registrada pelo scanner.', 'Fechar', {
      duration: 2500,
    });

    const scannerDialog = { afterClosed: () => of(null) };
    dialog.open.mockReturnValueOnce(scannerDialog);
    await service.scanAttendance();
    expect(dialog.open).toHaveBeenCalledWith(expect.anything(), {
      width: 'min(720px, 96vw)',
      maxWidth: '96vw',
      data: { eventId: event.id },
    });

    const error = new Error('scanner rejected');
    api.createEventAttendanceFromAztecCode.mockReturnValueOnce(throwError(() => error));
    await service.processScannedCode(event.id, 'BAD');
    expect(feedback.error).toHaveBeenCalledWith(error, 'Não foi possível registrar a presença.');
  });

  it('imports CSV with column selection, supports ambiguity resolution, cancellation, and errors', async () => {
    service.attendanceForm.controls.eventId.setValue(event.id);
    const file = csvFile('presencas.csv', 'email\nada@example.com');
    api.importEventAttendancesFromCsv
      .mockReturnValueOnce(
        of({
          createdCount: 0,
          duplicateCount: 0,
          failedCount: 0,
          failedValues: [],
          inferredMatchType: 'EMAIL',
          ambiguousValues: [{ value: 'ada@example.com', candidates: [person] }],
        }),
      )
      .mockReturnValueOnce(
        of({
          createdCount: 1,
          duplicateCount: 0,
          failedCount: 0,
          failedValues: [],
          inferredMatchType: 'EMAIL',
          ambiguousValues: [],
        }),
      );
    dialog.open
      .mockReturnValueOnce({ afterClosed: () => of('email') })
      .mockReturnValueOnce({ afterClosed: () => of([{ value: 'ada@example.com', personId: person.id }]) });

    await service.importAttendancesFromCsv(file);
    expect(api.importEventAttendancesFromCsv).toHaveBeenNthCalledWith(1, {
      eventId: event.id,
      csvContent: 'email\nada@example.com',
      selectedHeader: 'email',
    });
    expect(api.importEventAttendancesFromCsv).toHaveBeenNthCalledWith(2, {
      eventId: event.id,
      csvContent: 'email\nada@example.com',
      selectedHeader: 'email',
      resolutions: [{ value: 'ada@example.com', personId: person.id }],
    });
    expect(dialog.open).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ data: expect.anything() }));
    expect(service.isImportingCsv()).toBe(false);

    dialog.open.mockReset();
    dialog.open.mockReturnValueOnce({ afterClosed: () => of(null) });
    await service.importAttendancesFromCsv(file);
    expect(api.importEventAttendancesFromCsv).toHaveBeenCalledTimes(2);

    api.importEventAttendancesFromCsv.mockReturnValueOnce(throwError(() => new Error('CSV inválido')));
    dialog.open.mockReset();
    dialog.open.mockReturnValueOnce({ afterClosed: () => of('email') });
    await service.importAttendancesFromCsv(file);
    expect(feedback.error).toHaveBeenCalledWith(expect.any(Error), 'Não foi possível importar o CSV.');
    expect(service.isImportingCsv()).toBe(false);
  });

  it('loads attendance, explicit absence, roster, count, and offline projections', async () => {
    const submission = createAdminOfflineEventAttendanceSubmission(
      { eventId: event.id, person: null, personId: null, manualValue: 'valor manual' },
      event,
      person,
    );
    api.listOfflineEventAttendanceSubmissions.mockReturnValueOnce(of([submission]));

    await service.loadAttendances(event.id);

    expect(api.listEventAttendances).toHaveBeenCalledWith(event.id, { skip: 0, take: 51, status: 'PRESENT' });
    expect(api.listEventAttendances).toHaveBeenCalledWith(event.id, { skip: 0, take: 1000, status: 'ABSENT' });
    expect(service.attendanceTotalCount()).toBe(1);
    expect(service.attendances()[0]).toEqual(expect.objectContaining({ personName: person.name, status: 'PRESENT' }));
    expect(service.implicitAbsences()).toEqual([{ personId: person.id, status: false }]);
    expect(service.offlineAttendanceSubmissions()[0]).toEqual(
      expect.objectContaining({ eventName: event.name, personName: 'valor manual' }),
    );

    await service.loadAttendances('');
    expect(service.attendances()).toEqual([]);
    expect(service.attendanceTotalCount()).toBe(0);
  });

  it('reviews offline submissions with confirmation, cancellation, correction, and issue labels', async () => {
    const ready = createAdminOfflineEventAttendanceSubmission({ eventId: event.id }, event, person);
    const invalid = createAdminOfflineEventAttendanceSubmission(
      { id: 'offline-invalid', eventId: event.id, resolutionError: 'Sem correspondência', resolutionIssue: 'PERSON_NOT_FOUND' },
      event,
      person,
    );
    service.offlineAttendanceSubmissions.set([ready as never, invalid as never]);

    await service.approveOfflineAttendanceSubmission(ready as never);
    expect(api.approveOfflineEventAttendanceSubmission).toHaveBeenCalledWith(ready.id);
    service.offlineAttendanceSubmissions.set([ready as never, invalid as never]);

    dialog.open.mockReturnValueOnce({ afterClosed: () => of(false) });
    await service.rejectOfflineAttendanceSubmission(ready as never);
    expect(api.rejectOfflineEventAttendanceSubmission).not.toHaveBeenCalled();

    dialog.open.mockReturnValueOnce({ afterClosed: () => of(true) });
    await service.approveAllOfflineAttendanceSubmissions();
    expect(api.approveOfflineEventAttendanceSubmissions).toHaveBeenCalledWith([ready.id]);

    service.offlineAttendanceSubmissions.set([ready as never, invalid as never]);
    dialog.open.mockReturnValueOnce({ afterClosed: () => of(true) });
    await service.rejectAllOfflineAttendanceSubmissions();
    expect(api.rejectOfflineEventAttendanceSubmissions).toHaveBeenCalledWith(
      [ready.id, invalid.id],
      'Rejeitada em lote pelo painel administrativo.',
    );

    dialog.open.mockReturnValueOnce({ afterClosed: () => of(null) });
    await service.editOfflineAttendanceSubmission(ready as never);
    expect(api.updateOfflineEventAttendanceSubmission).not.toHaveBeenCalled();

    dialog.open.mockReturnValueOnce({ afterClosed: () => of({ manualValue: 'ada@example.com' }) });
    await service.editOfflineAttendanceSubmission(ready as never);
    expect(api.updateOfflineEventAttendanceSubmission).toHaveBeenCalledWith(ready.id, {
      manualValue: 'ada@example.com',
    });
    expect(service.offlineSubmissionIssueLabel('PERSON_NOT_FOUND')).toBe('Pessoa não encontrada');
    expect(service.canApproveOfflineAttendanceSubmission(invalid as never)).toBe(false);
  });

  it('exposes only attended major-event activities in the selected-person summary', () => {
    const attendance = createAdminMajorEventUserAttendance(
      {
        majorEventId: majorEvent.id,
        personId: person.id,
        attendances: [
          { eventId: 'event-1', eventName: 'Evento 1', eventEmoji: '🎓', eventStartDate: event.startDate, attended: true, attendedAt: null, category: 'REGULAR' },
          { eventId: 'event-2', eventName: 'Evento 2', eventEmoji: '💡', eventStartDate: event.startDate, attended: false, attendedAt: null, category: 'REGULAR' },
        ],
      },
      person,
      majorEvent,
    );
    service.selectMajorEventUserAttendance(attendance);

    expect(service.selectedMajorEventAttendances()).toEqual([
      expect.objectContaining({ eventId: 'event-1', eventEmoji: '🎓' }),
    ]);
  });

  it('loads major-event attendance, supports selection, and guards stale refreshes', async () => {
    await service.selectMajorEventAttendancesById(majorEvent.id);
    expect(api.listMajorEventUserAttendances).toHaveBeenCalledWith(majorEvent.id, { skip: 0, take: 51 });
    expect(router.navigate).toHaveBeenCalledWith(['/attendances/major-event', majorEvent.id]);
    expect(service.selectedMajorEventUserAttendance()?.majorEventId).toBe(majorEvent.id);

    const calls = api.listMajorEventUserAttendances.mock.calls.length;
    await service.refreshMajorEventUserAttendancesFor('other-major');
    expect(api.listMajorEventUserAttendances).toHaveBeenCalledTimes(calls);
    expect(service.getAttendanceCategoryLabel('NON_PAYING')).toBe('Sem pagamento');
    expect(service.getAttendanceCategoryHistoricalExplanation('UNKNOWN')).toBe(
      'Registro anterior à classificação automática.',
    );
    expect(service.getAttendanceCategoryHistoricalExplanation('REGULAR')).toBeNull();
    expect(service.getAttendanceCurrentAssessmentLabel('ACTIVITY_SUBSCRIPTION_MISSING')).toBe(
      'Sem inscrição ativa na atividade.',
    );
    expect(
      service.getMajorEventCurrentAssessmentLabel({
        ...createAdminMajorEventUserAttendance({ majorEventId: majorEvent.id }, person, majorEvent),
        attendances: [
          {
            eventId: 'event-1',
            eventName: 'Evento 1',
            attended: true,
            category: 'UNKNOWN',
            currentAssessment: 'MAJOR_EVENT_PAYMENT_AWAITING_RECEIPT',
          },
        ],
      }),
    ).toBe('Pagamento do grande evento aguardando comprovante.');
  });

  it('validates event CSV exports before opening download flows and maps export dialog cancellation', async () => {
    await service.exportEventAttendancesCsv();
    expect(snackBar.open).toHaveBeenCalledWith('Selecione um evento antes de baixar o CSV.', 'Fechar', {
      duration: 3000,
    });

    service.selectedAttendanceEvent.set(event);
    service.attendanceForm.controls.eventId.setValue(event.id);
    dialog.open.mockReturnValueOnce({ afterClosed: () => of(null) });
    await service.exportEventAttendancesCsv();
    expect(api.listEventAttendances).toHaveBeenCalledWith(event.id, { skip: 0, take: 1000, status: undefined });
  });
});

function csvFile(name: string, content: string): File {
  return { name, text: () => Promise.resolve(content) } as File;
}
