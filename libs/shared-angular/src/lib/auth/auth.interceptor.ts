import { isPlatformBrowser } from '@angular/common';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { PLATFORM_ID, inject } from '@angular/core';
import { Observable, catchError, switchMap, tap, throwError } from 'rxjs';
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
          catchError((refreshError) => {
            if (isAuthenticationFailure(refreshError)) {
              authService.clearSession();
            }

            return throwError(() => refreshError);
          }),
          switchMap(() => next(req)),
        );
      }

      return throwError(() => error);
    }),
    tap({
      next: (event) => {
        if (event instanceof HttpResponse && hasOnboardingError(event.body)) {
          authService.redirectToOnboarding();
        }
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 403 && hasOnboardingError(error.error)) {
          authService.redirectToOnboarding();
        }
      },
    }),
  );
};

function hasOnboardingError(body: unknown): boolean {
  if (!isRecord(body)) {
    return false;
  }
  if (body['code'] === 'ONBOARDING_REQUIRED') {
    return true;
  }
  const errors = body['errors'];
  return (
    Array.isArray(errors) &&
    errors.some((error: unknown) => {
      if (!isRecord(error) || !isRecord(error['extensions'])) {
        return false;
      }
      const extensions = error['extensions'];
      const originalError = extensions['originalError'];
      return (
        extensions['code'] === 'ONBOARDING_REQUIRED' ||
        (isRecord(originalError) && originalError['code'] === 'ONBOARDING_REQUIRED')
      );
    })
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAuthenticationFailure(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403);
}

function shouldSkipRefresh(req: HttpRequest<unknown>): boolean {
  const url = getRequestUrl(req.url);
  if (!url || url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
    return true;
  }

  return url.pathname === '/api/auth/refresh' || url.pathname === '/api/auth/me' || url.pathname === '/api/auth/logout';
}

function getRequestUrl(url: string): URL | null {
  try {
    return new URL(url, window.location.origin);
  } catch {
    return null;
  }
}
