import { HttpErrorResponse } from '@angular/common/http';
import { isRetryableSyncError } from './oral-attendance-page.component';

describe('isRetryableSyncError', () => {
  it.each([0, 408, 429, 500, 503])('retries transient HTTP status %s', (status) => {
    expect(isRetryableSyncError(new HttpErrorResponse({ status }))).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])('does not retry permanent HTTP status %s', (status) => {
    expect(isRetryableSyncError(new HttpErrorResponse({ status }))).toBe(false);
  });

  it('does not retry GraphQL validation errors represented as regular errors', () => {
    expect(isRetryableSyncError(new Error('Entrada inválida.'))).toBe(false);
  });
});
