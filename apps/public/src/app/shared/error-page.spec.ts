import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ErrorPage, RouteErrorService } from '@cacic-fct/shared-angular/errors';

@Component({ template: 'Protected content' })
class ProtectedPage {}

const customTitle = 'Você não tem acesso à gestão deste evento.';

describe('shared error page routing', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([
        {
          path: 'private',
          component: ProtectedPage,
          canActivate: [() => inject(RouteErrorService).guardRedirect(403, { title: customTitle })],
        },
        { path: 'error/403', component: ErrorPage, data: { pageError: { status: 403 } } },
        { path: 'error/404', component: ErrorPage, data: { pageError: { status: 404 } } },
      ])],
    });
  });

  it('renders shared denial copy while preserving the requested path, query and fragment', async () => {
    const harness = await RouterTestingHarness.create();
    const location = TestBed.inject(Location);
    const pushHistory = vi.spyOn(location, 'go');
    const replaceHistory = vi.spyOn(location, 'replaceState');
    await harness.navigateByUrl('/private?source=calendar#details', ErrorPage);

    expect(TestBed.inject(Location).path(true)).toBe('/private?source=calendar#details');
    expect(TestBed.inject(Router).url).toBe('/error/403');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe(customTitle);
    expect(harness.routeNativeElement?.textContent).not.toContain('Protected content');
    expect(TestBed.inject(Location).path()).not.toContain(customTitle);
    expect(pushHistory).toHaveBeenCalled();
    expect(replaceHistory).not.toHaveBeenCalled();
  });

  it('preserves a private resource address for page-selected 404 navigation', async () => {
    const harness = await RouterTestingHarness.create('/private?source=wallet#details');
    const errors = TestBed.inject(RouteErrorService);
    await errors.navigate(404);
    harness.detectChanges();

    expect(TestBed.inject(Location).path(true)).toBe('/private?source=wallet#details');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Página não encontrada.');
  });

  it('ignores error text supplied in query parameters', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/error/403?title=Injected&technicalDetails=secret', ErrorPage);

    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Você não tem acesso a esta página.');
    expect(harness.routeNativeElement?.textContent).not.toContain('secret');
  });
});
