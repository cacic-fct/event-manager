import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../auth/auth.service';

export type RedirectTarget = string | UrlTree | unknown[];

export const redirectAuthenticatedGuard = (redirectTo: RedirectTarget): CanActivateFn => {
  return (): boolean | UrlTree => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (!authService.isAuthenticated()) {
      return true;
    }

    if (typeof redirectTo === 'string') {
      return router.parseUrl(redirectTo);
    }

    if (redirectTo instanceof UrlTree) {
      return redirectTo;
    }

    return router.createUrlTree(redirectTo);
  };
};
