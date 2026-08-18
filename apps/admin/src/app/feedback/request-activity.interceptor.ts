import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { defer, finalize } from 'rxjs';
import { RequestActivityService } from './request-activity.service';

export const requestActivityInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isAdminApiRequest(request.url)) {
    return next(request);
  }

  const activity = inject(RequestActivityService);
  return defer(() => {
    const finish = activity.begin();
    return next(request).pipe(finalize(finish));
  });
};

function isAdminApiRequest(url: string): boolean {
  if (url.startsWith('/api/') || url === '/api') {
    return true;
  }

  try {
    const parsed = new URL(url, globalThis.location?.origin ?? 'http://localhost');
    return parsed.origin === globalThis.location?.origin && (parsed.pathname === '/api' || parsed.pathname.startsWith('/api/'));
  } catch {
    return false;
  }
}
