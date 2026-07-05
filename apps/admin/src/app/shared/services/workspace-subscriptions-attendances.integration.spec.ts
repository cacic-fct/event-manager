import { DOCUMENT } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { AttendanceApiService } from '../../graphql/attendance-api.service';
import { EventApiService } from '../../graphql/event-api.service';
import { PeopleApiService } from '../../graphql/people-api.service';
import { SubscriptionApiService } from '../../graphql/subscription-api.service';
import {
  createAdminMajorEvent,
  createAdminMajorEventUserAttendance,
  createAdminOfflineEventAttendanceSubmission,
  createAdminPerson,
  createAdminWorkspaceMajorEventSubscription,
  createAdminWorkspaceMajorEventSubscriptionEvent,
} from '../../testing/admin-entity-fixtures';
import { AttendancePersonResolutionDialogComponent } from '../../workspace/dialogs/attendance-person-resolution-dialog.component';
import { WorkspaceAttendancesService } from './workspace-attendances.service';
import { WorkspaceMajorEventsService } from './workspace-major-events.service';
import { WorkspaceSubscriptionsService } from './workspace-subscriptions.service';

describe('workspace subscription and attendance management integration', () => {
  let subscriptionsService: WorkspaceSubscriptionsService;
  let attendancesService: WorkspaceAttendancesService;
  let subscriptionApi: {
    listEventSubscriptions: ReturnType<typeof vi.fn>;
    createEventSubscription: ReturnType<typeof vi.fn>;
    listMajorEventSubscriptions: ReturnType<typeof vi.fn>;
    createMajorEventSubscription: ReturnType<typeof vi.fn>;
    updateMajorEventSubscription: ReturnType<typeof vi.fn>;
  };
  let attendanceApi: {
    listEventAttendances: ReturnType<typeof vi.fn>;
    listOfflineEventAttendanceSubmissions: ReturnType<typeof vi.fn>;
    createEventAttendance: ReturnType<typeof vi.fn>;
    deleteEventAttendance: ReturnType<typeof vi.fn>;
    importEventAttendancesFromCsv: ReturnType<typeof vi.fn>;
    listMajorEventUserAttendances: ReturnType<typeof vi.fn>;
    updateOfflineEventAttendanceSubmission: ReturnType<typeof vi.fn>;
  };
  let dialog: {
    open: ReturnType<typeof vi.fn>;
  };
  let snackbar: {
    open: ReturnType<typeof vi.fn>;
  };
  let router: {
    navigate: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const majorEvent = createAdminMajorEvent({ id: 'major-event-1', name: 'Semana da Computação' });
    subscriptionApi = {
      listEventSubscriptions: vi.fn(() => of([])),
      createEventSubscription: vi.fn(() => of(null)),
      listMajorEventSubscriptions: vi.fn(() => of([])),
      createMajorEventSubscription: vi.fn(() => of(createAdminWorkspaceMajorEventSubscription())),
      updateMajorEventSubscription: vi.fn((id: string, input: Record<string, unknown>) =>
        of(
          createAdminWorkspaceMajorEventSubscription({
            id,
            subscriptionStatus: input['subscriptionStatus'] === 'CANCELED' ? 'CANCELED' : 'CONFIRMED',
            amountPaid: typeof input['amountPaid'] === 'number' ? input['amountPaid'] : null,
            paymentDate: typeof input['paymentDate'] === 'string' ? input['paymentDate'] : null,
            paymentTier: typeof input['paymentTier'] === 'string' ? input['paymentTier'] : null,
          }),
        ),
      ),
    };
    attendanceApi = {
      listEventAttendances: vi.fn(() => of([])),
      listOfflineEventAttendanceSubmissions: vi.fn(() => of([])),
      createEventAttendance: vi.fn(() => of(null)),
      deleteEventAttendance: vi.fn(() => of({ deleted: true })),
      importEventAttendancesFromCsv: vi.fn(() =>
        of({
          createdCount: 0,
          duplicateCount: 0,
          failedCount: 0,
          failedValues: [],
          inferredMatchType: 'IDENTITY_DOCUMENT',
          ambiguousValues: [],
        }),
      ),
      listMajorEventUserAttendances: vi.fn(() =>
        of([createAdminMajorEventUserAttendance({ majorEventId: majorEvent.id })]),
      ),
      updateOfflineEventAttendanceSubmission: vi.fn(() => of(createAdminOfflineEventAttendanceSubmission())),
    };
    dialog = {
      open: vi.fn(),
    };
    snackbar = {
      open: vi.fn(),
    };
    router = {
      navigate: vi.fn(),
    };

    await TestBed.configureTestingModule({
      providers: [
        WorkspaceSubscriptionsService,
        WorkspaceAttendancesService,
        { provide: SubscriptionApiService, useValue: subscriptionApi },
        { provide: AttendanceApiService, useValue: attendanceApi },
        {
          provide: EventApiService,
          useValue: {
            listEvents: vi.fn(() => of([])),
            getEvent: vi.fn(),
          },
        },
        { provide: PeopleApiService, useValue: { listPeopleSummaries: vi.fn(() => of([])) } },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackbar },
        { provide: Router, useValue: router },
        { provide: DOCUMENT, useValue: document },
        { provide: WorkspaceMajorEventsService, useValue: { majorEvents: signal([majorEvent]) } },
      ],
    }).compileComponents();

    subscriptionsService = TestBed.inject(WorkspaceSubscriptionsService);
    attendancesService = TestBed.inject(WorkspaceAttendancesService);
  });

  it('refreshes major-event attendances after saving a major-event subscription', async () => {
    const subscription = createAdminWorkspaceMajorEventSubscription({
      id: 'major-event-subscription-1',
      majorEventId: 'major-event-1',
      events: [
        createAdminWorkspaceMajorEventSubscriptionEvent({ eventId: 'event-1', subscribed: true }),
        createAdminWorkspaceMajorEventSubscriptionEvent({ eventId: 'event-2', eventName: 'Palestra', subscribed: false }),
      ],
    });
    subscriptionsService.majorEventForm.controls.majorEventId.setValue('major-event-1');
    subscriptionsService.majorEventSubscriptions.set([subscription]);
    subscriptionsService.selectMajorEventSubscription(subscription);
    subscriptionsService.enableMajorEventEdit();
    subscriptionsService.setSelectedEvent('event-2', true);
    subscriptionsService.majorEventEditForm.patchValue({
      subscriptionStatus: 'CONFIRMED',
      amountPaid: 4000,
      paymentDate: '2026-05-20',
      paymentTier: 'Aluno',
    });
    attendancesService.majorEventAttendanceForm.controls.majorEventId.setValue('major-event-1');

    await subscriptionsService.saveMajorEventSubscription();

    expect(subscriptionApi.updateMajorEventSubscription).toHaveBeenCalledWith('major-event-subscription-1', {
      subscriptionStatus: 'CONFIRMED',
      amountPaid: 4000,
      paymentDate: '2026-05-20',
      paymentTier: 'Aluno',
      selectedEventIds: ['event-1', 'event-2'],
    });
    expect(attendanceApi.listMajorEventUserAttendances).toHaveBeenCalledWith('major-event-1', {
      skip: 0,
      take: 51,
    });
  });

  it('updates subscription data and creates/removes event attendances from the major-event attendance editor', async () => {
    const attendance = createAdminMajorEventUserAttendance({
      majorEventId: 'major-event-1',
      subscriptionId: 'major-event-subscription-1',
      personId: 'person-1',
      attendances: [
        {
          eventId: 'event-1',
          eventName: 'Credenciamento',
          eventStartDate: '2026-05-21T12:00:00.000Z',
          attended: true,
          attendedAt: '2026-05-21T12:30:00.000Z',
          category: 'REGULAR',
        },
        {
          eventId: 'event-2',
          eventName: 'Palestra',
          eventStartDate: '2026-05-21T14:00:00.000Z',
          attended: false,
          attendedAt: null,
          category: 'REGULAR',
        },
      ],
    });
    attendancesService.majorEventAttendanceForm.controls.majorEventId.setValue('major-event-1');
    attendancesService.selectMajorEventUserAttendance(attendance);
    attendancesService.enableMajorEventAttendanceEdit();
    attendancesService.setMajorEventAttendanceEvent('event-1', false);
    attendancesService.setMajorEventAttendanceEvent('event-2', true);
    attendancesService.majorEventAttendanceEditForm.patchValue({
      subscriptionStatus: 'CANCELED',
      amountPaid: 0,
      paymentDate: '2026-05-22',
      paymentTier: 'Isento',
    });

    await attendancesService.saveMajorEventAttendanceEdit();

    expect(subscriptionApi.updateMajorEventSubscription).toHaveBeenCalledWith('major-event-subscription-1', {
      subscriptionStatus: 'CANCELED',
      amountPaid: 0,
      paymentDate: '2026-05-22',
      paymentTier: 'Isento',
    });
    expect(attendanceApi.createEventAttendance).toHaveBeenCalledWith({ eventId: 'event-2', personId: 'person-1' });
    expect(attendanceApi.deleteEventAttendance).toHaveBeenCalledWith({ eventId: 'event-1', personId: 'person-1' });
    expect(attendancesService.majorEventAttendanceEditMode()).toBe(false);
  });

  it('opens correction flow and updates an offline attendance submission', async () => {
    const submission = createAdminOfflineEventAttendanceSubmission({
      eventId: 'event-1',
      personId: null,
      person: null,
      manualValue: 'ada@exmaple.com',
      resolutionError: 'Nenhuma pessoa encontrada para o dado informado.',
      resolutionIssue: 'PERSON_NOT_FOUND',
    });
    const updated = createAdminOfflineEventAttendanceSubmission({
      ...submission,
      personId: 'person-1',
      resolutionError: null,
      resolutionIssue: 'UNKNOWN',
    });
    dialog.open.mockReturnValue({
      afterClosed: () =>
        of({
          personId: 'person-1',
        }),
    });
    attendanceApi.updateOfflineEventAttendanceSubmission.mockReturnValue(of(updated));

    await attendancesService.editOfflineAttendanceSubmission({
      ...submission,
      eventName: 'Credenciamento',
      personName: 'Pessoa não resolvida',
    });

    expect(dialog.open).toHaveBeenCalled();
    expect(attendanceApi.updateOfflineEventAttendanceSubmission).toHaveBeenCalledWith('offline-attendance-1', {
      personId: 'person-1',
    });
    expect(attendanceApi.listEventAttendances).toHaveBeenCalledWith('event-1', { skip: 0, take: 51 });
    expect(attendanceApi.listOfflineEventAttendanceSubmissions).toHaveBeenCalledWith('event-1');
    expect(snackbar.open).toHaveBeenCalledWith('Presença off-line corrigida.', 'Fechar', { duration: 3000 });
  });

  it('shows a pending-adjustment message when the offline correction still has a resolution error', async () => {
    const submission = createAdminOfflineEventAttendanceSubmission({
      eventId: 'event-1',
      personId: null,
      person: null,
      manualValue: 'ada@exmaple.com',
      resolutionError: 'Nenhuma pessoa encontrada para o dado informado.',
      resolutionIssue: 'PERSON_NOT_FOUND',
    });
    const updated = createAdminOfflineEventAttendanceSubmission({
      ...submission,
      resolutionError: 'Nenhuma pessoa encontrada para o dado informado.',
      resolutionIssue: 'PERSON_NOT_FOUND',
    });
    dialog.open.mockReturnValue({
      afterClosed: () =>
        of({
          personId: 'missing-person',
        }),
    });
    attendanceApi.updateOfflineEventAttendanceSubmission.mockReturnValue(of(updated));

    await attendancesService.editOfflineAttendanceSubmission({
      ...submission,
      eventName: 'Credenciamento',
      personName: 'Pessoa não resolvida',
    });

    expect(snackbar.open).toHaveBeenCalledWith(
      'Correção salva, mas a presença ainda precisa de ajuste.',
      'Fechar',
      { duration: 3000 },
    );
  });

  it('resolves ambiguous CSV attendance values before retrying the import', async () => {
    const documentPerson = createAdminPerson({
      id: 'document-person',
      name: 'Ana Documento',
      identityDocument: '11999999975',
    });
    const phonePerson = createAdminPerson({
      id: 'phone-person',
      name: 'Bruno Telefone',
      phone: '+5511999999975',
    });
    attendanceApi.importEventAttendancesFromCsv
      .mockReturnValueOnce(
        of({
          createdCount: 0,
          duplicateCount: 0,
          failedCount: 0,
          failedValues: [],
          inferredMatchType: 'IDENTITY_DOCUMENT',
          ambiguousValues: [
            {
              value: '11999999975',
              candidates: [documentPerson, phonePerson],
            },
          ],
        }),
      )
      .mockReturnValueOnce(
        of({
          createdCount: 1,
          duplicateCount: 0,
          failedCount: 0,
          failedValues: [],
          inferredMatchType: 'IDENTITY_DOCUMENT',
          ambiguousValues: [],
        }),
      );
    dialog.open
      .mockReturnValueOnce({ afterClosed: () => of('identifier') })
      .mockReturnValueOnce({
        afterClosed: () => of([{ value: '11999999975', personId: 'phone-person' }]),
      })
      .mockReturnValueOnce({ afterClosed: () => of(null) });
    attendancesService.attendanceForm.controls.eventId.setValue('event-1');

    await attendancesService.importAttendancesFromCsv({
      name: 'presencas.csv',
      text: () => Promise.resolve('identifier\n11999999975'),
    } as unknown as File);

    expect(dialog.open).toHaveBeenNthCalledWith(
      2,
      AttendancePersonResolutionDialogComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          ambiguousValues: [
            {
              value: '11999999975',
              candidates: [documentPerson, phonePerson],
            },
          ],
        }),
      }),
    );
    expect(attendanceApi.importEventAttendancesFromCsv).toHaveBeenNthCalledWith(2, {
      eventId: 'event-1',
      csvContent: 'identifier\n11999999975',
      selectedHeader: 'identifier',
      resolutions: [{ value: '11999999975', personId: 'phone-person' }],
    });
    expect(attendanceApi.listEventAttendances).toHaveBeenCalledWith('event-1', { skip: 0, take: 51 });
  });
});
