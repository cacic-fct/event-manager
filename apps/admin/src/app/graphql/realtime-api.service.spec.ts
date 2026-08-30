import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FakeEventSource, installFakeEventSource } from '@cacic-fct/shared-angular/testing';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { RealtimeApiService } from './realtime-api.service';

describe('RealtimeApiService', () => {
  let platformId: 'browser' | 'server';
  let authService: { refreshMe: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    platformId = 'browser';
    authService = { refreshMe: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      providers: [
        RealtimeApiService,
        { provide: AuthService, useValue: authService },
        { provide: PLATFORM_ID, useFactory: () => platformId },
      ],
    });
  });

  it('opens authenticated workspace SSE and filters heartbeat messages into invalidations', () => {
    const restoreEventSource = installFakeEventSource();
    try {
      const service = TestBed.inject(RealtimeApiService);
      const invalidation = vi.fn();
      const subscription = service.watchWorkspace().subscribe(invalidation);
      const source = FakeEventSource.instances[0] as FakeEventSource;

      expect(source.url).toBe('/api/realtime/admin/workspace/events');
      expect(source.init).toEqual({ withCredentials: true });

      source.emitMessage({ type: 'heartbeat', timestamp: 1 });
      source.emitMessage({ type: 'EVENT_INVALIDATED', targetId: 'event-1' });

      expect(invalidation).toHaveBeenCalledOnce();
      expect(authService.refreshMe).not.toHaveBeenCalled();

      subscription.unsubscribe();
      expect(source.close).toHaveBeenCalledOnce();
    } finally {
      restoreEventSource();
    }
  });

  it('encodes event and major-event subscription scopes in their SSE URLs', () => {
    const restoreEventSource = installFakeEventSource();
    try {
      const service = TestBed.inject(RealtimeApiService);
      const eventSubscription = service.watchEventSubscriptions('event /1').subscribe();
      const majorEventSubscription = service.watchMajorEventSubscriptions('major event/2').subscribe();

      expect(FakeEventSource.instances.map((source) => source.url)).toEqual([
        '/api/realtime/admin/events/event%20%2F1/subscriptions/events',
        '/api/realtime/admin/major-events/major%20event%2F2/subscriptions/events',
      ]);

      eventSubscription.unsubscribe();
      majorEventSubscription.unsubscribe();
      expect(FakeEventSource.instances.every((source) => source.close.mock.calls.length === 1)).toBe(true);
    } finally {
      restoreEventSource();
    }
  });

  it('refreshes authentication before reconnecting after terminal EventSource closure', async () => {
    vi.useFakeTimers();
    const restoreEventSource = installFakeEventSource();
    try {
      const service = TestBed.inject(RealtimeApiService);
      const subscription = service.watchWorkspace().subscribe();
      const firstSource = FakeEventSource.instances[0] as FakeEventSource;

      firstSource.readyState = FakeEventSource.CLOSED;
      firstSource.emitError();
      await vi.advanceTimersByTimeAsync(999);

      expect(authService.refreshMe).toHaveBeenCalledOnce();
      expect(FakeEventSource.instances).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(FakeEventSource.instances).toHaveLength(2);

      subscription.unsubscribe();
    } finally {
      vi.useRealTimers();
      restoreEventSource();
    }
  });

  it('does not touch EventSource during server rendering', () => {
    platformId = 'server';
    const restoreEventSource = installFakeEventSource();
    try {
      const service = TestBed.inject(RealtimeApiService);
      const next = vi.fn();
      const error = vi.fn();
      const subscription = service.watchWorkspace().subscribe({ next, error });

      expect(FakeEventSource.instances).toHaveLength(0);
      expect(next).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      subscription.unsubscribe();
    } finally {
      restoreEventSource();
    }
  });
});
