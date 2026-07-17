import '../testing/observer-mocks';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Router } from '@angular/router';
import { MediaMatcher } from '@angular/cdk/layout';
import { AuthService } from '@cacic-fct/shared-angular';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
import { PlatformStatsApiService } from './platform-stats-api.service';
import { of } from 'rxjs';
import { LandingComponent } from './landing.component';

describe('LandingComponent', () => {
  let fixture: ComponentFixture<LandingComponent>;
  let authState: ReturnType<typeof signal<boolean>>;
  let login: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;
  let featureFlagValue: string | undefined;

  beforeEach(async () => {
    authState = signal(false);
    login = vi.fn().mockResolvedValue(undefined);
    navigateByUrl = vi.fn().mockResolvedValue(true);
    featureFlagValue = '/app/menu';

    await TestBed.configureTestingModule({
      imports: [LandingComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: authState,
            login,
          },
        },
        {
          provide: MediaMatcher,
          useValue: {
            matchMedia: () => ({
              matches: false,
              addEventListener: vi.fn(),
              removeEventListener: vi.fn(),
            }),
          },
        },
        {
          provide: PublicFeatureFlagService,
          useValue: {
            stringValue: vi.fn((key: string) => {
              if (key === 'defaultLoginRedirectPath') {
                return featureFlagValue;
              }

              return undefined;
            }),
          },
        },
        {
          provide: PlatformStatsApiService,
          useValue: {
            getPublicPlatformStats: () =>
              of({ peopleCount: 1, eventsCount: 2, majorEventsCount: 3, certificatesCount: 4 }),
          },
        },
      ],
    }).compileComponents();

    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(LandingComponent);
  });

  it('passes the feature-flagged default redirect to login', async () => {
    await fixture.componentInstance.login();

    expect(login).toHaveBeenCalledWith({ returnTo: '/app/menu' });
  });

  it('navigates authenticated users to the feature-flagged default redirect', async () => {
    authState.set(true);

    await fixture.componentInstance.login();

    expect(navigateByUrl).toHaveBeenCalledWith('/app/menu');
    expect(login).not.toHaveBeenCalled();
  });

  it('falls back to /app/calendar when the feature flag returns undefined', async () => {
    featureFlagValue = undefined;

    await fixture.componentInstance.login();

    expect(login).toHaveBeenCalledWith({ returnTo: '/app/calendar' });
  });

  it('navigates authenticated users to /app/calendar when the feature flag returns undefined', async () => {
    featureFlagValue = undefined;
    authState.set(true);

    await fixture.componentInstance.login();

    expect(navigateByUrl).toHaveBeenCalledWith('/app/calendar');
    expect(login).not.toHaveBeenCalled();
  });

  it('does not fall back when the feature flag returns an empty string', async () => {
    featureFlagValue = '';

    await fixture.componentInstance.login();

    expect(login).toHaveBeenCalledWith({ returnTo: '' });
  });

  it('renders the institutional and certificate-validation footer links', () => {
    fixture.detectChanges();
    const footer = fixture.nativeElement.querySelector('.landing-footer') as HTMLElement;
    const links = [...footer.querySelectorAll('a')];

    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Homepage do CACiC',
      'Conta CACiC',
      'Validar certificado',
      'Política de privacidade',
    ]);
    expect(links[0].href).toBe('https://cacic.com.br/');
    expect(links[1].href).toBe('https://account.cacic.com.br/');
    expect(links[2].getAttribute('href')).toBe('/validate');
  });
});
