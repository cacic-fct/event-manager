import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthenticatedUser, AuthService, CookieBannerSyncService } from '@cacic-fct/shared-angular';
import { firstValueFrom } from 'rxjs';

describe('CookieBannerSyncService', () => {
  const user = signal<AuthenticatedUser | null>(null);
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
  let httpTesting: HttpTestingController;
  let platformId: 'browser' | 'server';

  beforeAll(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: createStorage() });
  });

  beforeEach(() => {
    user.set(null);
    platformId = 'browser';
    window.localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user } },
        { provide: PLATFORM_ID, useFactory: () => platformId },
        CookieBannerSyncService,
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    window.localStorage.clear();
  });

  afterAll(() => {
    if (localStorageDescriptor) {
      Object.defineProperty(window, 'localStorage', localStorageDescriptor);
    } else {
      Reflect.deleteProperty(window, 'localStorage');
    }
  });

  it('records a successful authenticated acceptance for the selected user', async () => {
    const service = TestBed.inject(CookieBannerSyncService);
    const acceptance = firstValueFrom(service.acceptCookieBanner('user-1'));
    const request = httpTesting.expectOne('/api/privacy/cookie-banner/accept');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ synced: true });

    await expect(acceptance).resolves.toBe(true);
    expect(window.localStorage.getItem('cacic.cookieBanner.synced.user-1')).toBe('true');
  });

  it('returns false without recording synchronization when the backend rejects acceptance', async () => {
    const service = TestBed.inject(CookieBannerSyncService);
    const acceptance = firstValueFrom(service.acceptCookieBanner('user-1'));
    httpTesting.expectOne('/api/privacy/cookie-banner/accept').flush(
      { message: 'unavailable' },
      { status: 503, statusText: 'Unavailable' },
    );

    await expect(acceptance).resolves.toBe(false);
    expect(window.localStorage.getItem('cacic.cookieBanner.synced.user-1')).toBeNull();
  });

  it('synchronizes a previous local acceptance when an authenticated user becomes available', () => {
    window.localStorage.setItem('cacic.cookieBanner.accepted', 'true');
    const service = TestBed.inject(CookieBannerSyncService);
    expect(service).toBeDefined();

    user.set(userFixture('user-1'));
    TestBed.tick();
    httpTesting.expectOne('/api/privacy/cookie-banner/accept').flush({ synced: true });
    TestBed.tick();

    expect(window.localStorage.getItem('cacic.cookieBanner.synced.user-1')).toBe('true');
  });

  it('does not repeat synchronization for a user already marked as synchronized', () => {
    window.localStorage.setItem('cacic.cookieBanner.accepted', 'true');
    window.localStorage.setItem('cacic.cookieBanner.synced.user-1', 'true');
    user.set(userFixture('user-1'));

    TestBed.inject(CookieBannerSyncService);
    TestBed.tick();

    httpTesting.expectNone('/api/privacy/cookie-banner/accept');
  });

  it('does not access browser acceptance storage during server rendering', () => {
    platformId = 'server';
    window.localStorage.setItem('cacic.cookieBanner.accepted', 'true');
    user.set(userFixture('user-1'));

    TestBed.inject(CookieBannerSyncService);
    TestBed.tick();

    httpTesting.expectNone('/api/privacy/cookie-banner/accept');
  });
});

function userFixture(sub: string): AuthenticatedUser {
  return {
    sub,
    roles: [],
    scopes: [],
    oidcScopes: [],
    claims: {},
  };
}

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}
