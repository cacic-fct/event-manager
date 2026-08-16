import { TestBed } from '@angular/core/testing';
import { AuthService } from '@cacic-fct/shared-angular';
import type { CurrentUserMyDay } from '@cacic-fct/event-manager-public-contracts';
import { MyDayCacheService } from '@cacic-fct/public-indexed-db';
import { NEVER, Subject } from 'rxjs';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
import { NetworkStatusService } from '../shared/network-status.service';
import { RateLimitError } from '../shared/rate-limit-error';
import { MyDayApiService } from './my-day-api.service';
import { MyDayStore } from './my-day.store';

describe('MyDayStore request control', () => {
  const requests = new Map<string, Subject<CurrentUserMyDay>>();
  const api = {
    get: vi.fn((date: string) => {
      const request = new Subject<CurrentUserMyDay>();
      requests.set(date, request);
      return request.asObservable();
    }),
  };
  const cache = {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
  };
  let store: MyDayStore;

  beforeEach(() => {
    requests.clear();
    api.get.mockClear();
    cache.get.mockClear();
    cache.put.mockClear();

    TestBed.configureTestingModule({
      providers: [
        MyDayStore,
        { provide: AuthService, useValue: { user: () => ({ sub: 'user-1' }) } },
        { provide: MyDayApiService, useValue: api },
        { provide: MyDayCacheService, useValue: cache },
        { provide: NetworkStatusService, useValue: { isOnline: () => true, watchStatusChanges: () => NEVER } },
        { provide: PublicFeatureFlagService, useValue: { booleanValue: () => true } },
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
    requests.get('2026-08-16')?.next(day('2026-08-16'));
    requests.get('2026-08-16')?.complete();
    await Promise.all([first, second]);
  });

  it('unsubscribes a superseded date request', async () => {
    const first = store.load('2026-08-16');
    await Promise.resolve();
    const firstRequest = requests.get('2026-08-16');

    const second = store.load('2026-08-17');
    await Promise.resolve();

    expect(firstRequest?.observed).toBe(false);
    requests.get('2026-08-17')?.next(day('2026-08-17'));
    requests.get('2026-08-17')?.complete();
    await Promise.all([first, second]);
    expect(store.data()?.selectedDate).toBe('2026-08-17');
  });

  it('starts the visible cooldown after a rate-limit response', async () => {
    const result = store.load('2026-08-16');
    await Promise.resolve();
    requests.get('2026-08-16')?.error(new RateLimitError(12));
    await result;

    expect(store.cooldownSeconds()).toBe(12);
    expect(store.state()).toEqual(
      expect.objectContaining({ status: 'error', message: 'Muitas tentativas. Aguarde 12 segundos para tentar novamente.' }),
    );
  });
});

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
