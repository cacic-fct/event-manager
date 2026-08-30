import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { createPublicEvent, publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { AuthService } from '@cacic-fct/shared-angular';
import { signal } from '@angular/core';
import { NEVER, Observable, Subject, firstValueFrom, of } from 'rxjs';
import { RealtimeEventMessage, RealtimeEventsService } from '../../shared/realtime-events.service';
import { OnlineAttendanceApiService, PendingOnlineAttendanceEvent } from './online-attendance-api.service';
import { OnlineAttendanceCoordinatorService } from './coordinator.service';

describe('OnlineAttendanceCoordinatorService', () => {
  it('does not interrupt again after the current pending attendances are dismissed', async () => {
    const { api, router, service } = createService();

    const firstInterruption = await resolve(service);
    expect(firstInterruption).toEqual(expect.objectContaining({ id: 'online-attendance:event-1' }));

    service.dismissPending(['event-1'], '/menu');

    expect(router.navigateByUrl).toHaveBeenCalledWith('/menu');

    expect(await resolve(service)).toBeNull();

    api.listPendingEvents.mockReturnValue(of([pendingAttendanceEvent('event-2')]));

    const secondInterruption = await resolve(service);
    expect(secondInterruption).toEqual(expect.objectContaining({ id: 'online-attendance:event-2' }));
  });

  it('emits a change for every matching message, including an empty pending list', () => {
    const messages = new Subject<RealtimeEventMessage>();
    const { service } = createService(messages.asObservable());
    const changes: void[] = [];
    const subscription = service.changes().subscribe((change) => changes.push(change));

    messages.next({
      type: 'event',
      channel: 'current-user.online-attendance',
      event: 'pendingOnlineAttendancesChanged',
      payload: { eventIds: [] },
    });
    messages.next({
      type: 'event',
      channel: 'current-user.online-attendance',
      event: 'pendingOnlineAttendancesChanged',
      payload: { eventIds: ['event-1'] },
    });

    expect(changes).toHaveLength(2);
    subscription.unsubscribe();
  });
});

function createService(realtimeMessages: Observable<RealtimeEventMessage> = NEVER): {
  api: { listPendingEvents: ReturnType<typeof vi.fn> };
  router: { navigateByUrl: ReturnType<typeof vi.fn> };
  service: OnlineAttendanceCoordinatorService;
} {
  const api = {
    listPendingEvents: vi.fn(() => of([pendingAttendanceEvent('event-1')])),
  };

  TestBed.configureTestingModule({
    providers: [
      OnlineAttendanceCoordinatorService,
      {
        provide: AuthService,
        useValue: { isAuthenticated: signal(true) },
      },
      {
        provide: OnlineAttendanceApiService,
        useValue: api,
      },
      {
        provide: PLATFORM_ID,
        useValue: 'browser',
      },
      {
        provide: RealtimeEventsService,
        useValue: { watch: () => realtimeMessages },
      },
      {
        provide: Router,
        useValue: {
          createUrlTree: vi.fn((commands: unknown[]) => commands),
          navigate: vi.fn(),
          navigateByUrl: vi.fn(),
          url: '/menu',
        },
      },
    ],
  });

  const router = TestBed.inject(Router) as unknown as { navigateByUrl: ReturnType<typeof vi.fn> };
  return {
    api,
    router,
    service: TestBed.inject(OnlineAttendanceCoordinatorService),
  };
}

function resolve(service: OnlineAttendanceCoordinatorService) {
  return firstValueFrom(service.resolve({ currentUrl: '/menu' }));
}

function pendingAttendanceEvent(eventId: string): PendingOnlineAttendanceEvent {
  return {
    eventId,
    event: createPublicEvent({
      id: eventId,
      name: 'Evento teste',
      emoji: '🎓',
      startDate: publicFixtureDateFromNow(1, 12),
      endDate: publicFixtureDateFromNow(1, 13),
      type: 'OTHER',
      majorEvent: null,
    }),
  };
}
