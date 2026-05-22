import '../testing/observer-mocks';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { signal } from '@angular/core';
import { MediaMatcher } from '@angular/cdk/layout';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
import { LandingComponent } from './landing.component';

describe('LandingComponent', () => {
  let fixture: ComponentFixture<LandingComponent>;
  let authState: ReturnType<typeof signal<boolean>>;
  let login: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    authState = signal(false);
    login = vi.fn();
    navigateByUrl = vi.fn();

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
            stringValue: () => '/menu',
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
  });
});
