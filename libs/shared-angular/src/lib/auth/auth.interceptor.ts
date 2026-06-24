import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { PLATFORM_ID, inject } from '@angular/core';
import { Observable, catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId) || shouldSkipRefresh(req)) {
    return next(req);
  }

  return next(req).pipe(
    catchError((error) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        return authService.refreshTokenSilently().pipe(
          switchMap(() => next(req)),
          catchError((refreshError) => {
            authService.clearSession();
            return throwError(() => refreshError);
          }),
        );
      }

      return throwError(() => error);
    }),
  );
};

function shouldSkipRefresh(req: HttpRequest<unknown>): boolean {
  const url = getRequestUrl(req.url);
  if (!url || url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
    return true;
  }

  return (
    url.pathname === '/api/auth/refresh' || url.pathname === '/api/auth/me' || url.pathname === '/api/auth/logout'
  );
}

function getRequestUrl(url: string): URL | null {
  try {
    return new URL(url, window.location.origin);
  } catch {
    return null;
  }
}
