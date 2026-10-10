import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { GraphqlStatusError, RouteErrorService } from '@cacic-fct/shared-angular/errors';
import { AdminRouteResourceErrorService } from './admin-route-resource-error.service';

describe('AdminRouteResourceErrorService', () => {
  let service: AdminRouteResourceErrorService;
  const routeErrors = { navigate: vi.fn().mockResolvedValue(true) };

  beforeEach(() => {
    routeErrors.navigate.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: RouteErrorService, useValue: routeErrors },
      ],
    });
    service = TestBed.inject(AdminRouteResourceErrorService);
  });

  it.each([403, 404])('redirects a private resource response with status %s to shared 404', (status) => {
    expect(service.redirectIfUnavailable(new HttpErrorResponse({ status }))).toBe(true);
    expect(routeErrors.navigate).toHaveBeenCalledWith(404);
  });

  it.each([403, 404])('also redirects GraphQL private resource status %s to shared 404', (status) => {
    expect(service.redirectIfUnavailable(new GraphqlStatusError('Access denied', status))).toBe(true);
    expect(routeErrors.navigate).toHaveBeenCalledWith(404);
  });

  it('keeps service failures available to the page-level error state', () => {
    expect(service.redirectIfUnavailable(new HttpErrorResponse({ status: 503 }))).toBe(false);
    expect(service.redirectIfUnavailable(new GraphqlStatusError('Unavailable', 503))).toBe(false);
    expect(service.redirectIfUnavailable(new Error('unavailable'))).toBe(false);
    expect(routeErrors.navigate).not.toHaveBeenCalled();
  });
});
