import { HttpErrorResponse } from '@angular/common/http';
import type { PageErrorStatus } from '@cacic-fct/shared-angular/errors';
import { ForbiddenGraphqlError, GraphqlServiceError, NotFoundGraphqlError, RateLimitError } from './rate-limit-error';

/** Maps a page-load failure without exposing API payloads as page copy. */
export function routePageErrorStatus(error: unknown): PageErrorStatus {
  if (error instanceof ForbiddenGraphqlError) return 403;
  if (error instanceof NotFoundGraphqlError) return 404;
  if (error instanceof GraphqlServiceError) {
    return error.status;
  }
  if (error instanceof RateLimitError) {
    return 503;
  }

  if (!(error instanceof HttpErrorResponse)) {
    return 500;
  }

  if (error.status === 400 || error.status === 404) return 404;
  if (error.status === 403) return 403;
  if (error.status === 500) {
    return 500;
  }
  if (error.status === 0 || error.status === 401 || error.status === 429 || error.status === 502 || error.status === 503 || error.status === 504) {
    return 503;
  }

  return 500;
}

/** Hides forbidden-resource checks as not found for routes with a private identifier. */
export function privateResourceErrorStatus(error: unknown): PageErrorStatus {
  const status = routePageErrorStatus(error);
  return status === 403 ? 404 : status;
}
