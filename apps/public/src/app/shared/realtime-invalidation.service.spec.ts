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
});

async function flushSignals(): Promise<void> {
  TestBed.flushEffects();
  await Promise.resolve();
}
