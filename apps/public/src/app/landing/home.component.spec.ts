import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { DefaultRedirectService } from './default-redirect.service';
import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  it('resolves the authenticated default route instead of using a static route guard', async () => {
    const authState = signal(true);
    const resolve = vi.fn().mockResolvedValue('/profile/wallet');

    TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isAuthenticated: authState } },
        { provide: DefaultRedirectService, useValue: { resolve } },
      ],
    });
    TestBed.overrideComponent(HomeComponent, { set: { imports: [], template: '' } });

    const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(resolve).toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith('/profile/wallet');
  });
});
