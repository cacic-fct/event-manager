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
});
