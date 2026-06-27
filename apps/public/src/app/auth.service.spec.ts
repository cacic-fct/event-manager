import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CacicAccountPrivacyService } from '@cacic-fct/account-manager-privacy';
import { AuthService } from '@cacic-fct/shared-angular';
import { NEVER, of, throwError } from 'rxjs';
import { provideHttpClient } from '@angular/common/http';

describe('AuthService', () => {
  const refreshTrackingCookies = vi.fn(() => of(undefined));
  const clearTrackingCookies = vi.fn(() => of(undefined));

  let auth: AuthService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    refreshTrackingCookies.mockClear();
    clearTrackingCookies.mockClear();
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
});
