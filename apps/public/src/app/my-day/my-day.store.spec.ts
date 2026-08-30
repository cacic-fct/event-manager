import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '@cacic-fct/shared-angular';
import type { CurrentUserMyDay } from '@cacic-fct/event-manager-public-contracts';
import { MyDayCacheService } from '@cacic-fct/public-indexed-db';
import { NEVER, Subject } from 'rxjs';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
import { NetworkStatusService } from '../shared/network-status.service';
import { RateLimitError } from '../shared/rate-limit-error';
import { RealtimeInvalidationService } from '../shared/realtime-invalidation.service';
import { MyDayApiService } from './my-day-api.service';
import { myDayDateKey } from './my-day-date';
import { MyDayStore } from './my-day.store';

const requests: Array<{ date: string; subject: Subject<CurrentUserMyDay> }> = [];

describe('MyDayStore request control', () => {
  const authUser = signal<{ sub: string } | null>({ sub: 'user-1' });
  const api = {
    get: vi.fn((date: string) => {
      const request = new Subject<CurrentUserMyDay>();
      requests.push({ date, subject: request });
      return request.asObservable();
    }),
  };
  const cache = {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
  };
  let store: MyDayStore;
  let currentUserChanges: Subject<void>;
  let catalogChanges: Subject<void>;

  beforeEach(() => {
    requests.length = 0;
    currentUserChanges = new Subject<void>();
    catalogChanges = new Subject<void>();
    authUser.set({ sub: 'user-1' });
    api.get.mockClear();
    cache.get.mockClear();
    cache.put.mockClear();

    TestBed.configureTestingModule({
      providers: [
        MyDayStore,
        { provide: AuthService, useValue: { user: authUser } },
        { provide: MyDayApiService, useValue: api },
        { provide: MyDayCacheService, useValue: cache },
        { provide: NetworkStatusService, useValue: { isOnline: () => true, watchStatusChanges: () => NEVER } },
        { provide: PublicFeatureFlagService, useValue: { booleanValue: () => true } },
        {
          provide: RealtimeInvalidationService,
          useValue: {
            watchCurrentUserData: () => currentUserChanges,
            watchCatalog: () => catalogChanges,
          },
        },
      ],
    });
    store = TestBed.inject(MyDayStore);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('shares an in-flight request for the same date', async () => {
    const first = store.load('2026-08-16');
    const second = store.load('2026-08-16');
    await Promise.resolve();

    expect(api.get).toHaveBeenCalledTimes(1);
    latestRequest('2026-08-16').next(day('2026-08-16'));
    latestRequest('2026-08-16').complete();
    await Promise.all([first, second]);
  });

  it('unsubscribes a superseded date request', async () => {
    const first = store.load('2026-08-16');
    await Promise.resolve();
    const firstRequest = latestRequest('2026-08-16');

    const second = store.load('2026-08-17');
    await Promise.resolve();

    expect(firstRequest?.observed).toBe(false);
    latestRequest('2026-08-17').next(day('2026-08-17'));
    latestRequest('2026-08-17').complete();
    await Promise.all([first, second]);
    expect(store.data()?.selectedDate).toBe('2026-08-17');
  });

  it('starts the visible cooldown after a rate-limit response', async () => {
    const result = store.load('2026-08-16');
    await Promise.resolve();
    latestRequest('2026-08-16').error(new RateLimitError(12));
    await result;

    expect(store.cooldownSeconds()).toBe(12);
    expect(store.state()).toEqual(
      expect.objectContaining({
        status: 'error',
        message: 'Muitas tentativas. Aguarde 12 segundos para tentar novamente.',
      }),
    );
  });

  it('does not share or publish an in-flight response across user identities', async () => {
    const first = store.load('2026-08-16');
    await Promise.resolve();
    const firstRequest = latestRequest('2026-08-16');

    authUser.set({ sub: 'user-2' });
    const second = store.load('2026-08-16');
    await Promise.resolve();

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(firstRequest.observed).toBe(false);
    latestRequest('2026-08-16').next(day('2026-08-16'));
    latestRequest('2026-08-16').complete();
    await Promise.all([first, second]);

    expect(cache.put).toHaveBeenCalledWith('user-2', expect.objectContaining({ selectedDate: '2026-08-16' }));
    expect(cache.put).not.toHaveBeenCalledWith('user-1', expect.anything());
    expect(store.data()?.selectedDate).toBe('2026-08-16');
  });

  it('force-refreshes the selected day after an invalidation while retaining the last good snapshot on failure', async () => {
    const selectedDate = '2026-08-16';
    const initialSnapshot = day(selectedDate);
    const initialLoad = store.load(selectedDate);
    await Promise.resolve();
    latestRequest(selectedDate).next(initialSnapshot);
    latestRequest(selectedDate).complete();
    await initialLoad;

    const today = myDayDateKey(new Date());
    cache.get.mockImplementation((_userId: string, date: string) =>
      Promise.resolve(date === selectedDate ? initialSnapshot : date === today ? day(date) : null),
    );
    TestBed.runInInjectionContext(() => store.start());
    TestBed.flushEffects();
    await Promise.resolve();
    const callsBeforeInvalidation = api.get.mock.calls.length;

    currentUserChanges.next();
    await Promise.resolve();
    await Promise.resolve();

    expect(api.get).toHaveBeenCalledTimes(callsBeforeInvalidation + 1);
    latestRequest(selectedDate).error(new Error('Falha transitória'));
    await Promise.resolve();

    expect(store.state()).toEqual(
      expect.objectContaining({
        status: 'error',
        data: initialSnapshot,
        message: 'Falha transitória',
      }),
    );
  });
});

function latestRequest(date: string): Subject<CurrentUserMyDay> {
  const request = [...requests].reverse().find((entry) => entry.date === date)?.subject;
  if (!request) {
    throw new Error(`Expected a request for ${date}.`);
  }
  return request;
}

function day(selectedDate: string): CurrentUserMyDay {
  return {
    generatedAt: new Date().toISOString(),
    selectedDate,
    minimumDate: '2026-07-16',
    hasContent: true,
    currentEvent: null,
    nextEvent: null,
    laterEvents: [],
    attention: [],
    weather: [],
  };
}
