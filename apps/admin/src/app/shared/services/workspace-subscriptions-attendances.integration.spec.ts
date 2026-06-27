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
  createAdminWorkspaceMajorEventSubscription,
  createAdminWorkspaceMajorEventSubscriptionEvent,
} from '../../testing/admin-entity-fixtures';
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
    listMajorEventUserAttendances: ReturnType<typeof vi.fn>;
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
      listMajorEventUserAttendances: vi.fn(() =>
        of([createAdminMajorEventUserAttendance({ majorEventId: majorEvent.id })]),
      ),
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
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
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
});
