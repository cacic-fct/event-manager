import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '@cacic-fct/shared-angular';
import { FakeEventSource, installFakeEventSource } from '@cacic-fct/shared-angular/testing';
import { of } from 'rxjs';
import { RealtimeInvalidationService } from './realtime-invalidation.service';

describe('RealtimeInvalidationService', () => {
  const user = signal<{ sub: string } | null>(null);

  beforeEach(() => {
    user.set(null);
    TestBed.configureTestingModule({
      providers: [
        RealtimeInvalidationService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AuthService, useValue: { user } },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('opens the private stream only while a user is authenticated', async () => {
    const restoreEventSource = installFakeEventSource();
    try {
      const service = TestBed.inject(RealtimeInvalidationService);
      const subscription = service.watchCurrentUserData(() => of(undefined)).subscribe();
      await flushSignals();

      expect(FakeEventSource.instances).toHaveLength(0);

      user.set({ sub: 'user-1' });
      await flushSignals();

      expect(FakeEventSource.instances).toHaveLength(1);
      expect(FakeEventSource.instances[0]?.url).toBe('/api/realtime/current-user/data/events');

      const source = FakeEventSource.instances[0] as FakeEventSource;
      user.set(null);
      await flushSignals();

      expect(source.close).toHaveBeenCalledOnce();
      subscription.unsubscribe();
    } finally {
      restoreEventSource();
    }
  });

  it('opens the public catalog stream with credentials and recovers after a terminal close', async () => {
    vi.useFakeTimers();
    const restoreEventSource = installFakeEventSource();
    try {
      const recover = vi.fn(() => of(undefined));
      const service = TestBed.inject(RealtimeInvalidationService);
      const subscription = service.watchCatalog(recover).subscribe();
      const firstSource = FakeEventSource.instances[0] as FakeEventSource;

      expect(firstSource.url).toBe('/api/realtime/public/catalog/events');
      expect(firstSource.init).toEqual({ withCredentials: true });

      firstSource.readyState = FakeEventSource.CLOSED;
      firstSource.emitError();
      await vi.advanceTimersByTimeAsync(999);

      expect(recover).toHaveBeenCalledOnce();
      expect(FakeEventSource.instances).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(FakeEventSource.instances).toHaveLength(2);

      subscription.unsubscribe();
    } finally {
      vi.useRealTimers();
      restoreEventSource();
    }
  });

  it('encodes organizer scope identifiers in the private stream URL', () => {
    const restoreEventSource = installFakeEventSource();
    try {
      const service = TestBed.inject(RealtimeInvalidationService);
      const subscription = service.watchOrganizer('event group', 'group / 1', () => of(undefined)).subscribe();

      expect(FakeEventSource.instances[0]?.url).toBe(
        '/api/realtime/current-user/organizer/event%20group/group%20%2F%201/events',
      );
      subscription.unsubscribe();
    } finally {
      restoreEventSource();
    }
  });

  it('replaces the private stream when the authenticated user changes', async () => {
    const restoreEventSource = installFakeEventSource();
    try {
      const service = TestBed.inject(RealtimeInvalidationService);
      const subscription = service.watchCurrentUserData(() => of(undefined)).subscribe();

      user.set({ sub: 'user-1' });
      await flushSignals();
      const firstSource = FakeEventSource.instances[0] as FakeEventSource;

      user.set({ sub: 'user-2' });
      await flushSignals();

      expect(firstSource.close).toHaveBeenCalledOnce();
      expect(FakeEventSource.instances).toHaveLength(2);
      subscription.unsubscribe();
    } finally {
      restoreEventSource();
    }
  });

  it('does not create browser streams during server rendering', () => {
    const restoreEventSource = installFakeEventSource();
    try {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          RealtimeInvalidationService,
          { provide: PLATFORM_ID, useValue: 'server' },
          { provide: AuthService, useValue: { user } },
        ],
      });

      const service = TestBed.inject(RealtimeInvalidationService);
      const subscription = service.watchCatalog(() => of(undefined)).subscribe();

      expect(FakeEventSource.instances).toHaveLength(0);
      subscription.unsubscribe();
    } finally {
      restoreEventSource();
    }
  });
});

async function flushSignals(): Promise<void> {
  TestBed.flushEffects();
  await Promise.resolve();
}
