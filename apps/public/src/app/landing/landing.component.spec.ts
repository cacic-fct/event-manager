import '../testing/observer-mocks';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Router } from '@angular/router';
import { MediaMatcher } from '@angular/cdk/layout';
import { AuthService } from '@cacic-fct/shared-angular';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
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
    featureFlagValue = '/menu';

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
      ],
    }).compileComponents();

    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(LandingComponent);
  });

  it('passes the feature-flagged default redirect to login', async () => {
    await fixture.componentInstance.login();

    expect(login).toHaveBeenCalledWith({ returnTo: '/menu' });
  });

  it('navigates authenticated users to the feature-flagged default redirect', async () => {
    authState.set(true);

    await fixture.componentInstance.login();

    expect(navigateByUrl).toHaveBeenCalledWith('/menu');
    expect(login).not.toHaveBeenCalled();
  });

  it('falls back to /calendar when the feature flag returns undefined', async () => {
    featureFlagValue = undefined;

    await fixture.componentInstance.login();

    expect(login).toHaveBeenCalledWith({ returnTo: '/calendar' });
  });

  it('navigates authenticated users to /calendar when the feature flag returns undefined', async () => {
    featureFlagValue = undefined;
    authState.set(true);

    await fixture.componentInstance.login();

    expect(navigateByUrl).toHaveBeenCalledWith('/calendar');
    expect(login).not.toHaveBeenCalled();
  });

  it('does not fall back when the feature flag returns an empty string', async () => {
    featureFlagValue = '';

    await fixture.componentInstance.login();

    expect(login).toHaveBeenCalledWith({ returnTo: '' });
  });
});
