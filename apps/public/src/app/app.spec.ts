import { TestBed } from '@angular/core/testing';
import { AuthService, CookieBannerSyncService } from '@cacic-fct/shared-angular';
import { signal } from '@angular/core';
import { CacicAccountPrivacyService } from '@cacic-fct/account-manager-privacy';
import { of } from 'rxjs';
import { App } from './app';
import { PublicFeatureFlagService } from './feature-flags/public-feature-flag.service';

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
          },
        },
        {
          provide: CookieBannerSyncService,
          useValue: {
            acceptCookieBanner,
          },
        },
        {
          provide: CacicAccountPrivacyService,
          useValue: {
            refresh: refreshAccountPrivacy,
          },
        },
        {
          provide: PublicFeatureFlagService,
          useValue: {
            booleanValue: () => true,
          },
        },
      ],
    }).compileComponents();
  });

  it('should render', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled).toBeTruthy();
  });

  it('hides the cookie banner when disabled by feature flag override', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentRef.setInput('cookieBannerEnabledOverride', false);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-cookie-banner')).toBeNull();
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
