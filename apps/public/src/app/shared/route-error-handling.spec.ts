import { HttpErrorResponse } from '@angular/common/http';
import { ForbiddenGraphqlError, GraphqlServiceError, NotFoundGraphqlError } from './rate-limit-error';
import { privateResourceErrorStatus, routePageErrorStatus } from './route-error-handling';

describe('privateResourceErrorStatus', () => {
  it.each([
    ['a forbidden GraphQL response', new ForbiddenGraphqlError('forbidden')],
    ['a missing GraphQL resource', new NotFoundGraphqlError('missing')],
    ['an HTTP forbidden response', new HttpErrorResponse({ status: 403 })],
    ['an HTTP not-found response', new HttpErrorResponse({ status: 404 })],
  ])('masks %s as not found', (_description, error) => {
    expect(privateResourceErrorStatus(error)).toBe(404);
  });

  it.each([
    ['an internal server error', 500, 500],
    ['an unavailable server', 503, 503],
    ['a failed network request', 0, 503],
  ])('maps %s to the shared page status', (_description, httpStatus, expectedStatus) => {
    expect(privateResourceErrorStatus(new HttpErrorResponse({ status: httpStatus }))).toBe(expectedStatus);
  });

  it('maps a GraphQL service failure to its shared page status', () => {
    expect(privateResourceErrorStatus(new GraphqlServiceError('service unavailable', 503))).toBe(503);
  });

  it('preserves permission denials as 403 when the route is not a private resource lookup', () => {
    expect(routePageErrorStatus(new ForbiddenGraphqlError('forbidden'))).toBe(403);
    expect(routePageErrorStatus(new HttpErrorResponse({ status: 403 }))).toBe(403);
  });

  it('uses a generic internal page error for unexpected private-resource failures', () => {
    expect(privateResourceErrorStatus(new Error('Resource load failed'))).toBe(500);
    expect(privateResourceErrorStatus(new HttpErrorResponse({ status: 400 }))).toBe(404);
  });
});
