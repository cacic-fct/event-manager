import { TestBed } from '@angular/core/testing';
import { AuthService } from '@cacic-fct/shared-angular';
import { signal } from '@angular/core';
import { App } from './app';
import { CookieBannerSyncService } from './privacy/cookie-banner-sync.service';
import { PublicFeatureFlagService } from './feature-flags/public-feature-flag.service';

describe('App', () => {
  beforeEach(async () => {
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
            acceptCookieBanner: vi.fn(),
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
});
