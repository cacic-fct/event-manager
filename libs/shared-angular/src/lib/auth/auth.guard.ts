import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  void authService.login({ returnTo: state.url });
  return router.parseUrl('/login');
};

export const requiredPermissionsGuard =
  (permissions: readonly string[], fallbackUrl: string | UrlTree): CanActivateFn =>
  async () => {
    const authService = inject(AuthService);
    const router = inject(Router);
    const platformId = inject(PLATFORM_ID);

    if (!authService.isAuthenticated()) {
      return router.parseUrl('/login');
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
