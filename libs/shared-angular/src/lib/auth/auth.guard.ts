import { PLATFORM_ID, inject, isDevMode } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import type { Permission } from '@cacic-fct/shared-permissions';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  if (authService.consumePostLogoutRedirect()) {
    return router.parseUrl('/');
  }

  void authService.login({ returnTo: state.url });
  return false;
};

export const authGuardWithLocalLogin =
  (loginUrl = '/login'): CanActivateFn =>
  (_route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.isAuthenticated()) {
      return true;
    }

    if (authService.consumePostLogoutRedirect()) {
      return router.parseUrl(loginUrl);
    }

    if (!isDevMode()) {
      void authService.login({ returnTo: state.url });
      return false;
    }

    return router.parseUrl(`${loginUrl}?returnTo=${encodeURIComponent(state.url)}`);
  };

export const requiredPermissionsGuard =
  (permissions: readonly Permission[], fallbackUrl: string | UrlTree): CanActivateFn =>
  async (_route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);
    const platformId = inject(PLATFORM_ID);

    if (!authService.isAuthenticated()) {
      void authService.login({ returnTo: state.url });
      return false;
    }

    const grantedPermissions = await firstValueFrom(authService.evaluatePermissions(permissions));

    if (grantedPermissions.length > 0) {
      return true;
    }

    if (
      typeof fallbackUrl === 'string' &&
      (fallbackUrl.startsWith('/') || fallbackUrl.startsWith('http')) &&
      isPlatformBrowser(platformId)
    ) {
      window.location.assign(fallbackUrl);
      return false;
    }

    return typeof fallbackUrl === 'string' ? router.parseUrl(fallbackUrl) : fallbackUrl;
  };
