import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PublicMapCacheService } from './public-map-cache.service';

const PREFIX = 'cacic-eventos:public-map:v1:';

describe('PublicMapCacheService', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('round-trips a value until its TTL expires, then removes it', () => {
    const service = createService('browser');

    service.write('events', [{ id: 'event-1' }], 60_000);
    expect(service.read('events')).toEqual([{ id: 'event-1' }]);

    vi.advanceTimersByTime(60_000);

    expect(service.read('events')).toBeNull();
    expect(sessionStorage.getItem(`${PREFIX}events`)).toBeNull();
  });

  it('treats malformed and invalid-expiry entries as cache misses', () => {
    const service = createService('browser');
    sessionStorage.setItem(`${PREFIX}broken`, '{');
    sessionStorage.setItem(`${PREFIX}invalid-expiry`, JSON.stringify({ expiresAt: 'later', value: 1 }));

    expect(service.read('broken')).toBeNull();
    expect(service.read('invalid-expiry')).toBeNull();
  });

  it('invalidates only map-owned session entries', () => {
    const service = createService('browser');
    service.write('events', [1], 60_000);
    service.write('mine:user-1', ['event-1'], 60_000);
    sessionStorage.setItem('unrelated', 'keep');

    service.invalidate();

    expect(service.read('events')).toBeNull();
    expect(service.read('mine:user-1')).toBeNull();
    expect(sessionStorage.getItem('unrelated')).toBe('keep');
  });

  it('is a no-op during SSR', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const service = createService('server');

    service.write('events', [1], 60_000);
    service.invalidate();

    expect(service.read('events')).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
  });
});

function createService(platformId: 'browser' | 'server'): PublicMapCacheService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platformId }] });
  return TestBed.inject(PublicMapCacheService);
}
