import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { signal } from '@angular/core';
import { NEVER, firstValueFrom, of } from 'rxjs';
import { RealtimeEventsService } from '../../shared/realtime-events.service';
import { OnlineAttendanceApiService, PendingOnlineAttendanceEvent } from './online-attendance-api.service';
import { OnlineAttendanceCoordinatorService } from './online-attendance-coordinator.service';

describe('OnlineAttendanceCoordinatorService', () => {
  it('does not interrupt again after the current pending attendances are dismissed', async () => {
    const { api, service } = createService();

    expect(await resolve(service)).not.toBeNull();

    service.dismissPending(['event-1'], '/menu');

    expect(await resolve(service)).toBeNull();

    api.listPendingEvents.mockReturnValue(of([pendingAttendanceEvent('event-2')]));

    expect(await resolve(service)).not.toBeNull();
  });
});

function createService(): {
  api: { listPendingEvents: ReturnType<typeof vi.fn> };
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
        useValue: { watch: () => NEVER },
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

  return {
    api,
    service: TestBed.inject(OnlineAttendanceCoordinatorService),
  };
}

function resolve(service: OnlineAttendanceCoordinatorService) {
  return firstValueFrom(service.resolve({ currentUrl: '/menu' }));
}

function pendingAttendanceEvent(eventId: string): PendingOnlineAttendanceEvent {
  return {
    eventId,
    event: {
      id: eventId,
      name: 'Evento teste',
      emoji: '🎓',
      startDate: '2026-06-25T12:00:00.000Z',
      endDate: '2026-06-25T13:00:00.000Z',
      type: 'OTHER',
      majorEvent: null,
    },
  };
}
