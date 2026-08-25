import '@angular/compiler';
import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { EnvironmentInjector, PLATFORM_ID, createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { CacicAccountPrivacyService } from '@cacic-fct/account-manager-privacy';
import { of } from 'rxjs';
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
    const refresh = vi
      .spyOn(service, 'refreshTokenSilently')
      .mockReturnValue(of({ expiresAt: Date.now() + 60_000 }));
    const redirectToOnboarding = Reflect.get(service, 'redirectToOnboardingIfNeeded') as () => Promise<void>;

    await redirectToOnboarding.call(service);
    await redirectToOnboarding.call(service);

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.getItem('cacic-eventos:onboarding-refresh-attempted')).toBeNull();
  });

  async function checkExistingSsoSession(): Promise<void> {
    const check = Reflect.get(service, 'checkExistingSsoSession') as () => Promise<void>;
    await check.call(service);
  }
});
