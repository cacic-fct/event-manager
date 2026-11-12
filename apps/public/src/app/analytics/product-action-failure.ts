import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';
import {
  ForbiddenGraphqlError,
  GraphqlServiceError,
  NotFoundGraphqlError,
  RateLimitError,
} from '../shared/rate-limit-error';

export function productActionFailureReason(error: unknown) {
  if (error instanceof RateLimitError || (error instanceof HttpErrorResponse && error.status === 429)) {
    return 'rate_limited';
  }
  if (error instanceof TimeoutError || (error instanceof HttpErrorResponse && error.status === 0)) {
    return 'network';
  }
  if (error instanceof GraphqlServiceError || (error instanceof HttpErrorResponse && error.status >= 500)) {
    return 'server';
  }
  if (
    error instanceof ForbiddenGraphqlError ||
    error instanceof NotFoundGraphqlError ||
    (error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500)
  ) {
    return 'rejected';
  }
  return 'unknown';
}
