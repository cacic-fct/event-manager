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
        { provide: DefaultRedirectService, useValue: { navigateToDefault } },
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
});
