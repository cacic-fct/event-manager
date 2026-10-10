import '@angular/compiler';
import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  EnvironmentInjector,
  PLATFORM_ID,
  REQUEST,
  RESPONSE_INIT,
  createEnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { CacicAccountPrivacyService } from '@cacic-fct/account-manager-privacy';
import { defer, of, Subject, throwError } from 'rxjs';
import type { AuthRefreshResult } from './auth.types';
import { AUTH_ONBOARDING_ENFORCEMENT_ENABLED } from './auth-onboarding-enforcement.token';
import { AuthOnlineStatusService } from './auth-online-status.service';
import { AuthService } from './auth.service';
import { SilentSsoService, type SilentSsoResult } from './silent-sso.service';

describe('AuthService silent SSO fallback', () => {
  const rootEnvironmentInjector = null as unknown as EnvironmentInjector;
  const silentSso = {
    check: vi.fn<() => Promise<SilentSsoResult>>(),
  };
  let injector: EnvironmentInjector;
  let service: AuthService;

  beforeEach(() => {
    window.sessionStorage.clear();
    silentSso.check.mockReset();
    injector = createEnvironmentInjector(
      [
        AuthService,
        { provide: DOCUMENT, useValue: document },
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: HttpClient, useValue: {} },
        { provide: CacicAccountPrivacyService, useValue: {} },
        { provide: AuthOnlineStatusService, useValue: { isOnline: () => true } },
        { provide: AUTH_ONBOARDING_ENFORCEMENT_ENABLED, useValue: () => true },
        { provide: SilentSsoService, useValue: silentSso },
      ],
      rootEnvironmentInjector,
    );
    service = runInInjectionContext(injector, () => injector.get(AuthService));
  });

  afterEach(() => {
    injector.destroy();
    vi.restoreAllMocks();
  });

  it('keeps the existing redirect check as the fallback when silent check-sso errors', async () => {
    const failure = new Error('Third-party cookies are unavailable');
    silentSso.check.mockRejectedValue(failure);
    const redirectFallback = vi.spyOn(service, 'loginWithExistingSsoSession').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await checkExistingSsoSession();

    expect(redirectFallback).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Silent SSO check failed; falling back to redirect', failure);
  });

  it('does not redirect when check-sso completes without an existing session', async () => {
    silentSso.check.mockResolvedValue('unauthenticated');
    const redirectFallback = vi.spyOn(service, 'loginWithExistingSsoSession').mockImplementation(() => undefined);

    await checkExistingSsoSession();

    expect(redirectFallback).not.toHaveBeenCalled();
  });

  it('refreshes again after returning from onboarding with a stale claim', async () => {
    const currentUrl = window.location.href;
    window.sessionStorage.setItem('cacic-eventos:onboarding-return-url', currentUrl);
    service.user.set({ sub: 'user-id', claims: { is_onboarded: false } });
    const refresh = vi.spyOn(service, 'refreshTokenSilently').mockReturnValue(of({ expiresAt: Date.now() + 60_000 }));
    const redirectToOnboarding = Reflect.get(service, 'redirectToOnboardingIfNeeded') as () => Promise<void>;

    await redirectToOnboarding.call(service);
    await redirectToOnboarding.call(service);

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.getItem('cacic-eventos:onboarding-refresh-attempted')).toBeNull();
  });

  it('shares one silent restoration attempt between concurrent guards', async () => {
    const user = { sub: 'restored-user' };
    const refresh = vi.spyOn(service, 'refreshTokenSilently').mockReturnValue(
      defer(() => {
        service.user.set(user);
        return of({ expiresAt: Date.now() + 60_000 });
      }),
    );

    const outcomes = await Promise.all([service.ensureAuthenticated(), service.ensureAuthenticated()]);

    expect(outcomes).toEqual([true, true]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('returns false when silent restoration is denied', async () => {
    vi.spyOn(service, 'refreshTokenSilently').mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401, url: '/api/auth/refresh' })),
    );

    await expect(service.ensureAuthenticated()).resolves.toBe(false);
  });

  it('keeps an expected asynchronous refresh denial memoized after the HTTP request clears the session', async () => {
    const refreshResponse = new Subject<AuthRefreshResult>();
    const http = {
      post: vi.fn(() => refreshResponse.asObservable()),
    };
    Reflect.set(service, 'http', http);

    const firstAttempt = service.ensureAuthenticated();
    const concurrentAttempt = service.ensureAuthenticated();
    expect(http.post).toHaveBeenCalledOnce();

    refreshResponse.error(new HttpErrorResponse({ status: 401, url: '/api/auth/refresh' }));

    await expect(Promise.all([firstAttempt, concurrentAttempt])).resolves.toEqual([false, false]);
    await expect(service.ensureAuthenticated()).resolves.toBe(false);
    expect(http.post).toHaveBeenCalledOnce();
  });

  it('opens a fresh recovery attempt after a successful recovery is cleared', async () => {
    const refreshResponses: Subject<AuthRefreshResult>[] = [];
    const http = {
      post: vi.fn(() => {
        const response = new Subject<AuthRefreshResult>();
        refreshResponses.push(response);
        return response.asObservable();
      }),
      get: vi.fn(() => of({ sub: 'restored-user' })),
    };
    Reflect.set(service, 'http', http);

    const recovered = service.ensureAuthenticated();
    expect(http.post).toHaveBeenCalledOnce();
    refreshResponses[0]?.next({ expiresAt: Date.now() + 60_000 });
    await expect(recovered).resolves.toBe(true);
    expect(service.isAuthenticated()).toBe(true);

    service.clearSession();
    expect(service.isAuthenticated()).toBe(false);

    const nextRecovery = service.ensureAuthenticated();
    expect(http.post).toHaveBeenCalledTimes(2);
    refreshResponses[1]?.error(new HttpErrorResponse({ status: 401, url: '/api/auth/refresh' }));
    await expect(nextRecovery).resolves.toBe(false);
  });

  it('throws on an unexpected restoration outage and allows a later retry', async () => {
    const outage = new HttpErrorResponse({ status: 503, url: '/api/auth/refresh' });
    const refresh = vi
      .spyOn(service, 'refreshTokenSilently')
      .mockReturnValueOnce(throwError(() => outage))
      .mockReturnValueOnce(of({ expiresAt: Date.now() + 60_000 }));

    await expect(service.ensureAuthenticated()).rejects.toBe(outage);
    await expect(service.ensureAuthenticated()).resolves.toBe(false);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('does not refresh when a user is already authenticated', async () => {
    service.user.set({ sub: 'already-authenticated' });
    const refresh = vi.spyOn(service, 'refreshTokenSilently');

    await expect(service.ensureAuthenticated()).resolves.toBe(true);

    expect(refresh).not.toHaveBeenCalled();
  });

  it('uses the guarded target for onboarding after restoration and keeps its full base-prefixed URL', async () => {
    const base = document.querySelector('base');
    const previousBaseHref = base?.getAttribute('href') ?? null;
    const createdBase = base ?? document.createElement('base');
    createdBase.setAttribute('href', '/app/');
    if (!base) document.head.append(createdBase);

    try {
      const returnTo = '/profile?filter=upcoming&sort=desc#details';
      const pendingReturnUrl = new URL(`/app${returnTo}`, window.location.origin).toString();
      window.sessionStorage.setItem('cacic-eventos:onboarding-return-url', pendingReturnUrl);
      window.sessionStorage.removeItem('cacic-eventos:onboarding-refresh-attempted');
      const http = {
        post: vi.fn(() => of({ expiresAt: Date.now() + 60_000 })),
        get: vi.fn(() => of({ sub: 'restored-user', claims: { is_onboarded: false } })),
      };
      Reflect.set(service, 'http', http);

      await expect(service.ensureAuthenticated({ returnTo })).resolves.toBe(true);

      expect(http.post).toHaveBeenCalledOnce();
      expect(http.post).toHaveBeenCalledWith('/api/auth/refresh', {});
      expect(http.get).toHaveBeenCalledOnce();
      expect(window.sessionStorage.getItem('cacic-eventos:onboarding-return-url')).toBe(pendingReturnUrl);
      expect(window.sessionStorage.getItem('cacic-eventos:onboarding-refresh-attempted')).toBeNull();
    } finally {
      if (base) {
        if (previousBaseHref === null) base.removeAttribute('href');
        else base.setAttribute('href', previousBaseHref);
      } else {
        createdBase.remove();
      }
    }
  });

  async function checkExistingSsoSession(): Promise<void> {
    const check = Reflect.get(service, 'checkExistingSsoSession') as () => Promise<void>;
    await check.call(service);
  }
});

describe('AuthService SSR login redirect', () => {
  const rootEnvironmentInjector = null as unknown as EnvironmentInjector;
  const requestUrl = 'https://eventos.cacic.com.br/app/profile?filter=upcoming&sort=desc';

  it('prefixes the application base for an explicit return path and merges response headers', async () => {
    const request = { url: requestUrl } as Request;
    const response: ResponseInit = {
      status: 200,
      headers: new Headers({ 'X-Request-Id': 'request-123', 'Cache-Control': 'private' }),
    };
    const server = createServerAuthService(request, response);

    try {
      await server.service.login({ returnTo: '/profile?filter=upcoming#details' });
      const headers = new Headers(response.headers);
      const location = headers.get('Location');
      const redirect = new URL(location ?? '/', request.url);

      expect(response.status).toBe(302);
      expect(redirect.pathname).toBe('/api/auth/login/redirect');
      expect(redirect.searchParams.get('returnTo')).toBe('/app/profile?filter=upcoming#details');
      expect(headers.get('X-Request-Id')).toBe('request-123');
      expect(headers.get('Cache-Control')).toBe('no-store, max-age=0');
    } finally {
      server.injector.destroy();
    }
  });

  it('does not duplicate the base path when returnTo already includes it', async () => {
    const request = { url: requestUrl } as Request;
    const response: ResponseInit = { headers: new Headers() };
    const server = createServerAuthService(request, response);

    try {
      await server.service.login({ returnTo: '/app/profile?filter=upcoming#details' });
      const location = new Headers(response.headers).get('Location');
      const redirect = new URL(location ?? '/', request.url);

      expect(redirect.searchParams.get('returnTo')).toBe('/app/profile?filter=upcoming#details');
    } finally {
      server.injector.destroy();
    }
  });

  it('uses the incoming request path and query when no returnTo is supplied', async () => {
    const request = { url: requestUrl } as Request;
    const response: ResponseInit = { headers: new Headers() };
    const server = createServerAuthService(request, response);

    try {
      await server.service.login();
      const location = new Headers(response.headers).get('Location');
      const redirect = new URL(location ?? '/', request.url);

      expect(redirect.searchParams.get('returnTo')).toBe('/app/profile?filter=upcoming&sort=desc');
    } finally {
      server.injector.destroy();
    }
  });

  it('keeps prerender login safe when no incoming request exists', async () => {
    const response: ResponseInit = {
      status: 200,
      headers: new Headers({ 'X-Request-Id': 'prerender', 'Cache-Control': 'public' }),
    };
    const server = createServerAuthService(null, response);

    try {
      await expect(server.service.login()).resolves.toBeUndefined();

      const headers = new Headers(response.headers);
      expect(response.status).toBe(200);
      expect(headers.get('X-Request-Id')).toBe('prerender');
      expect(headers.get('Location')).toBeNull();
      expect(headers.get('Cache-Control')).toBe('public');
    } finally {
      server.injector.destroy();
    }
  });

  function createServerAuthService(request: Request | null, response: ResponseInit): {
    injector: EnvironmentInjector;
    service: AuthService;
  } {
    const serverDocument = document.implementation.createHTMLDocument();
    serverDocument.head.innerHTML = '<base href="/app/">';
    const injector = createEnvironmentInjector(
      [
        AuthService,
        { provide: DOCUMENT, useValue: serverDocument },
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: REQUEST, useValue: request },
        { provide: RESPONSE_INIT, useValue: response },
        { provide: HttpClient, useValue: {} },
        { provide: CacicAccountPrivacyService, useValue: {} },
        { provide: AuthOnlineStatusService, useValue: { isOnline: () => true } },
        { provide: AUTH_ONBOARDING_ENFORCEMENT_ENABLED, useValue: () => true },
        { provide: SilentSsoService, useValue: { check: vi.fn() } },
      ],
      rootEnvironmentInjector,
    );

    return {
      injector,
      service: runInInjectionContext(injector, () => injector.get(AuthService)),
    };
  }
});
