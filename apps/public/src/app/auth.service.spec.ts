import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CacicAccountPrivacyService } from '@cacic-fct/account-manager-privacy';
import { AuthOnlineStatusService, AuthService } from '@cacic-fct/shared-angular';
import { NEVER, firstValueFrom, of, throwError } from 'rxjs';
import { provideHttpClient } from '@angular/common/http';

describe('AuthService', () => {
  const refreshTrackingCookies = vi.fn(() => of(undefined));
  const clearTrackingCookies = vi.fn(() => of(undefined));
  const isOnline = vi.fn(() => true);

  let auth: AuthService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    refreshTrackingCookies.mockClear();
    clearTrackingCookies.mockClear();
    isOnline.mockReset();
    isOnline.mockReturnValue(true);
    refreshTrackingCookies.mockReturnValue(of(undefined));
    clearTrackingCookies.mockReturnValue(of(undefined));

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: CacicAccountPrivacyService,
          useValue: {
            refreshTrackingCookies,
            clearTrackingCookies,
          },
        },
        { provide: AuthOnlineStatusService, useValue: { isOnline } },
      ],
    });

    auth = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    auth.clearSession();
    window.sessionStorage.clear();
    httpTesting.verify();
  });

  it('does not block local logout on tracking cookie clearing', async () => {
    clearTrackingCookies.mockReturnValue(NEVER);
    auth.user.set({ sub: 'user-id' });

    const logout = auth.logout();
    httpTesting.expectOne('/api/auth/logout').flush({});

    await expect(logout).resolves.toBeUndefined();
    expect(auth.user()).toBeNull();
    expect(clearTrackingCookies).toHaveBeenCalledOnce();
  });

  it('waits for registered local cleanup before making the logout request', async () => {
    let finishCleanup!: () => void;
    const cleanup = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        }),
    );
    auth.registerBeforeLogoutCleanup(cleanup);

    const logout = auth.logout();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(httpTesting.match('/api/auth/logout')).toHaveLength(0);

    finishCleanup();
    let logoutRequest: TestRequest | undefined;
    await vi.waitFor(() => {
      logoutRequest = httpTesting.match('/api/auth/logout')[0];
      expect(logoutRequest).toBeDefined();
    });
    logoutRequest?.flush({});

    await expect(logout).resolves.toBeUndefined();
  });

  it('keeps tracking refresh failures best-effort', async () => {
    refreshTrackingCookies.mockReturnValue(throwError(() => new Error('tracking unavailable')));

    const refresh = auth.refreshMe();
    httpTesting.expectOne('/api/auth/me').flush({ sub: 'user-id', claims: { is_onboarded: true } });

    await expect(refresh).resolves.toBeUndefined();
    expect(auth.user()).toEqual({ sub: 'user-id', claims: { is_onboarded: true } });
    expect(refreshTrackingCookies).toHaveBeenCalledOnce();
  });

  it('stores the user returned by development password login and clears auth redirect markers', async () => {
    window.sessionStorage.setItem('cacic-eventos:post-logout-redirect', 'true');
    window.sessionStorage.setItem('cacic-eventos:silent-sso-attempted', 'true');
    const user = {
      sub: 'user-id',
      email: 'aluno@unesp.br',
      roles: ['access'],
      scopes: ['openid'],
      oidcScopes: ['openid'],
      claims: {
        is_onboarded: true,
        exp: Math.floor(Date.now() / 1000) + 300,
      },
    };

    const login = auth.passwordLogin('aluno@unesp.br', '1');
    httpTesting.expectOne('/api/auth/password-login').flush({
      user,
      expiresAt: Date.now() + 300_000,
      sessionExpiresAt: Date.now() + 600_000,
    });

    await expect(login).resolves.toEqual(user);
    expect(auth.user()).toEqual(user);
    expect(window.sessionStorage.getItem('cacic-eventos:post-logout-redirect')).toBeNull();
    expect(window.sessionStorage.getItem('cacic-eventos:silent-sso-attempted')).toBeNull();
    expect(refreshTrackingCookies).toHaveBeenCalledOnce();
  });

  it('initializes from the current session and exposes derived authentication state', async () => {
    const user = authenticatedUser();

    const initialization = auth.initialize();
    httpTesting.expectOne('/api/auth/me').flush(user);
    await initialization;

    expect(auth.initialized()).toBe(true);
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.roles()).toEqual(['access']);
    expect(auth.scopes()).toEqual(['openid']);
    expect(refreshTrackingCookies).toHaveBeenCalledOnce();
  });

  it('finishes offline initialization without starting silent SSO after an unauthenticated response', async () => {
    isOnline.mockReturnValue(false);

    const initialization = auth.initialize();
    httpTesting.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    await initialization;

    expect(auth.initialized()).toBe(true);
    expect(auth.user()).toBeNull();
    expect(isOnline).toHaveBeenCalledOnce();
  });

  it('coalesces concurrent silent refreshes and reloads the authenticated user once', async () => {
    const user = authenticatedUser();
    const first = firstValueFrom(auth.refreshTokenSilently());
    const second = firstValueFrom(auth.refreshTokenSilently());

    httpTesting.expectOne('/api/auth/refresh').flush({
      expiresAt: Date.now() + 300_000,
      sessionExpiresAt: Date.now() + 600_000,
    });
    httpTesting.expectOne('/api/auth/me').flush(user);

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ expiresAt: expect.any(Number) }),
      expect.objectContaining({ expiresAt: expect.any(Number) }),
    ]);
    expect(auth.user()).toEqual(user);
    expect(refreshTrackingCookies).toHaveBeenCalledOnce();
  });

  it('refreshes the token after the current-user endpoint returns unauthenticated', async () => {
    const user = authenticatedUser();
    const refresh = auth.refreshMe();

    httpTesting.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    const refreshRequest = await waitForRequest('/api/auth/refresh');
    refreshRequest.flush({
      expiresAt: Date.now() + 300_000,
      sessionExpiresAt: Date.now() + 600_000,
    });
    (await waitForRequest('/api/auth/me')).flush(user);

    await expect(refresh).resolves.toBeUndefined();
    expect(auth.user()).toEqual(user);
  });

  it('deduplicates permission evaluation requests and returns only granted permissions', async () => {
    const evaluation = firstValueFrom(auth.evaluatePermissions(['event#read', 'event#read', 'event#update'] as never));
    const request = httpTesting.expectOne('/api/auth/permissions/evaluate');
    expect(request.request.body).toEqual({ permissions: ['event#read', 'event#update'] });
    request.flush({ permissions: ['event#read'] });

    await expect(evaluation).resolves.toEqual(['event#read']);
  });

  it('consumes a post-logout redirect marker exactly once', () => {
    window.sessionStorage.setItem('cacic-eventos:post-logout-redirect', 'true');

    expect(auth.consumePostLogoutRedirect()).toBe(true);
    expect(auth.consumePostLogoutRedirect()).toBe(false);
  });

  async function waitForRequest(url: string): Promise<TestRequest> {
    let request: TestRequest | undefined;
    await vi.waitFor(() => {
      request ??= httpTesting.match(url)[0];
      expect(request).toBeDefined();
    });
    if (!request) {
      throw new Error(`Request was not created: ${url}`);
    }
    return request;
  }
});

function authenticatedUser() {
  return {
    sub: 'user-id',
    email: 'aluno@unesp.br',
    roles: ['access'],
    scopes: ['openid'],
    oidcScopes: ['openid'],
    claims: {
      is_onboarded: true,
      exp: Math.floor(Date.now() / 1000) + 300,
    },
  };
}
