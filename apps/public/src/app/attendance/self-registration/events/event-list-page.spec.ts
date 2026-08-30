import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { createPublicEvent } from '../../../testing/public-entity-fixtures';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { EmojiService } from '../../../shared/emoji.service';
import { OnlineAttendanceApiService, PendingOnlineAttendanceEvent } from '../online-attendance-api.service';
import { OnlineAttendanceCoordinatorService } from '../coordinator.service';
import { OnlineAttendanceListComponent } from './event-list-page';
import { BehaviorSubject, Observable, Subject, throwError, of } from 'rxjs';

describe('OnlineAttendanceListComponent', () => {
  it('renders pending attendance events with major-event context', async () => {
    const { fixture } = await createFixture({
      pendingEvents: [pendingAttendanceEvent()],
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Presenças pendentes');
    expect(fixture.nativeElement.textContent).toContain('Presença on-line');
    expect(fixture.nativeElement.textContent).toContain('SECOMPP Pago');
  });

  it('renders the empty pending attendance state', async () => {
    const { fixture } = await createFixture({ pendingEvents: [] });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Nenhuma presença pendente.');
  });

  it('renders API errors without throwing during component creation', async () => {
    const { fixture } = await createFixture({
      error: new Error('Falha de rede'),
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Falha de rede');
  });

  it('dismisses the displayed attendances and returns to the provided URL when the toolbar back action is used', async () => {
    const pendingEvent = pendingAttendanceEvent();
    const { attendanceCoordinator, component } = await createFixture({
      queryParams: { returnUrl: '/profile/attendances' },
      pendingEvents: [pendingEvent],
    });

    component.back();

    expect(attendanceCoordinator.dismissPending).toHaveBeenCalledWith(['online-event'], '/profile/attendances');
  });

  it('removes the last pending attendance when a live empty snapshot arrives', async () => {
    const { fixture, changes } = await createFixture({ pendingEventsAfterChange: [] });

    expect(fixture.componentInstance.state()).toEqual({
      status: 'ready',
      items: [pendingAttendanceEvent()],
    });

    changes.next();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toEqual({ status: 'ready', items: [] });
    expect(fixture.nativeElement.textContent).toContain('Nenhuma presença pendente.');
  });

  it('keeps the last good list when a live refetch fails', async () => {
    const { fixture, changes } = await createFixture({ liveError: new Error('Falha transitória') });

    changes.next();
    await fixture.whenStable();

    expect(fixture.componentInstance.state()).toEqual({
      status: 'ready',
      items: [pendingAttendanceEvent()],
    });
  });

  it('stops listening for live changes when destroyed', async () => {
    const { fixture, changes, api } = await createFixture({ pendingEventsAfterChange: [] });
    const requestCount = api.listPendingEvents.mock.calls.length;

    fixture.destroy();
    changes.next();

    expect(api.listPendingEvents).toHaveBeenCalledTimes(requestCount);
  });

  it('does not let the initial response overwrite a newer live refresh', async () => {
    const initial = new Subject<PendingOnlineAttendanceEvent[]>();
    const live = new Subject<PendingOnlineAttendanceEvent[]>();
    const newest = pendingAttendanceEvent();
    newest.event = createPublicEvent({ id: newest.eventId, name: 'Estado mais recente' });
    const { component, changes } = await createFixture({ responses: [initial, live] });

    changes.next();
    live.next([newest]);
    initial.next([pendingAttendanceEvent()]);

    expect(component.state()).toEqual({ status: 'ready', items: [newest] });
  });
});

async function createFixture({
  error,
  pendingEvents = [pendingAttendanceEvent()],
  pendingEventsAfterChange,
  liveError,
  responses,
  queryParams = {},
}: {
  error?: Error;
  pendingEvents?: PendingOnlineAttendanceEvent[];
  pendingEventsAfterChange?: PendingOnlineAttendanceEvent[];
  liveError?: Error;
  responses?: Observable<PendingOnlineAttendanceEvent[]>[];
  queryParams?: Record<string, string>;
} = {}): Promise<{
  component: OnlineAttendanceListComponent;
  fixture: ComponentFixture<OnlineAttendanceListComponent>;
  api: { listPendingEvents: ReturnType<typeof vi.fn> };
  attendanceCoordinator: { dismissPending: ReturnType<typeof vi.fn> };
  changes: Subject<void>;
}> {
  const queryParamMap = new BehaviorSubject(convertToParamMap(queryParams));
  const api = {
    listPendingEvents: vi.fn(),
  };
  if (responses) {
    responses.forEach((response) => api.listPendingEvents.mockReturnValueOnce(response));
  } else {
    api.listPendingEvents.mockReturnValueOnce(error ? throwError(() => error) : of(pendingEvents));
    if (pendingEventsAfterChange !== undefined || liveError) {
      api.listPendingEvents.mockReturnValueOnce(liveError ? throwError(() => liveError) : of(pendingEventsAfterChange));
    }
  }
  const changes = new Subject<void>();
  const attendanceCoordinator = {
    dismissPending: vi.fn(),
    changes: () => changes.asObservable(),
  };

  await TestBed.configureTestingModule({
    imports: [OnlineAttendanceListComponent],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap,
        },
      },
      {
        provide: EmojiService,
        useValue: {
          getTwemojiUrl: vi.fn(() => ''),
        },
      },
      {
        provide: OnlineAttendanceApiService,
        useValue: api,
      },
      {
        provide: OnlineAttendanceCoordinatorService,
        useValue: attendanceCoordinator,
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(OnlineAttendanceListComponent);
  fixture.detectChanges();

  return {
    component: fixture.componentInstance,
    fixture,
    api,
    attendanceCoordinator,
    changes,
  };
}

function pendingAttendanceEvent(): PendingOnlineAttendanceEvent {
  return {
    eventId: 'online-event',
    event: createPublicEvent({
      id: 'online-event',
      name: 'Presença on-line',
      emoji: 'check_circle',
      startDate: publicFixtureDateFromNow(1, 14),
      endDate: publicFixtureDateFromNow(1, 16),
      majorEvent: {
        id: 'paid-major',
        name: 'SECOMPP Pago',
      } as never,
    }),
  };
}
