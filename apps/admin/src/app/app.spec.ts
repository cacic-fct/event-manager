import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '@cacic-fct/shared-angular';
import { CacicAccountPrivacyService } from '@cacic-fct/account-manager-privacy';
import { of } from 'rxjs';
import { App } from './app';
import { CookieBannerSyncService } from './privacy/cookie-banner-sync.service';

describe('App', () => {
  const acceptCookieBanner = vi.fn(() => of(true));
  const refreshAccountPrivacy = vi.fn(() => of(undefined));

  beforeEach(async () => {
    acceptCookieBanner.mockReturnValue(of(true));
    refreshAccountPrivacy.mockReturnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(false),
            user: signal(null),
          },
        },
        {
          provide: CacicAccountPrivacyService,
          useValue: {
            refresh: refreshAccountPrivacy,
          },
        },
        {
          provide: CookieBannerSyncService,
          useValue: {
            acceptCookieBanner,
          },
        },
      ],
    }).compileComponents();
  });

  it('should create', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('does not reject local cookie acceptance when backend sync fails', async () => {
    acceptCookieBanner.mockReturnValue(of(false));
    const fixture = TestBed.createComponent(App);
    const component = fixture.componentInstance as unknown as {
      cookieBannerConfig: { onAccept?: (context: { isAuthenticated: boolean }) => Promise<unknown> };
    };

    await expect(component.cookieBannerConfig.onAccept?.({ isAuthenticated: true })).resolves.toBeUndefined();
    expect(refreshAccountPrivacy).not.toHaveBeenCalled();
  });
});
