import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { DefaultRedirectService } from './default-redirect.service';
import { HomeComponent } from './home-redirect.page';

describe('HomeComponent', () => {
  it('resolves the authenticated default route instead of using a static route guard', async () => {
    const authState = signal(true);
    const navigateToDefault = vi.fn().mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isAuthenticated: authState } },
        { provide: DefaultRedirectService, useValue: { navigateToDefault, navigateOfflineReturningUser: vi.fn() } },
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

  it('checks for a saved offline login when the live authentication session is unavailable', async () => {
    const navigateOfflineReturningUser = vi.fn().mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isAuthenticated: signal(false) } },
        { provide: DefaultRedirectService, useValue: { navigateOfflineReturningUser } },
      ],
    });
    TestBed.overrideComponent(HomeComponent, { set: { imports: [], template: '' } });

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(navigateOfflineReturningUser).toHaveBeenCalledWith(TestBed.inject(Router));
  });
});
