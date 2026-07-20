import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { DefaultRedirectService } from './default-redirect.service';
import { HomeComponent } from './home.component';
import { PlatformStatsApiService } from './platform-stats-api.service';
import { of } from 'rxjs';

describe('HomeComponent', () => {
  it('resolves the authenticated default route instead of using a static route guard', async () => {
    const authState = signal(true);
    const navigateToDefault = vi.fn().mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isAuthenticated: authState } },
        { provide: DefaultRedirectService, useValue: { navigateToDefault } },
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: PlatformStatsApiService, useValue: { getPublicPlatformStats: () => of({}) } },
      ],
    });
    TestBed.overrideComponent(HomeComponent, { set: { imports: [], template: '' } });

    const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(navigateToDefault).toHaveBeenCalledWith(TestBed.inject(Router));
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('renders the login page without navigating for unauthenticated users', async () => {
    const authState = signal(false);
    const navigateToDefault = vi.fn().mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isAuthenticated: authState } },
        { provide: DefaultRedirectService, useValue: { navigateToDefault } },
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: PlatformStatsApiService, useValue: { getPublicPlatformStats: () => of({}) } },
      ],
    });

    const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(navigateToDefault).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('app-login-page')).not.toBeNull();
  });
});
