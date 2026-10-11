import { inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import type { Permission } from '@cacic-fct/shared-permissions';
import { firstValueFrom, timeout } from 'rxjs';
import { RouteErrorOptions, RouteErrorService } from '../errors/route-error.service';
import { AuthService } from './auth.service';

export const authGuard = (async (_route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const errors = inject(RouteErrorService);

  if (auth.isAuthenticated()) return true;
  // A deliberate logout must not immediately start another SSO round trip.
  if (auth.consumePostLogoutRedirect()) return router.parseUrl('/');

  try {
    if (await auth.ensureAuthenticated({ returnTo: state.url })) return true;
    await auth.login({ returnTo: state.url });
    return false;
  } catch {
    return errors.guardRedirect(503);
  }
}) satisfies CanActivateFn;

/** Compatibility alias; guarded routes always use the identity provider login. */
export const authGuardWithLocalLogin = (): CanActivateFn => authGuard;

/** Any of the requested permissions grants access, matching the workspace permission model. */
export const requiredPermissionsGuard = (
  permissions: readonly Permission[],
  options: RouteErrorOptions = {},
): CanActivateFn => async (route, state) => {
  const auth = inject(AuthService);
  const errors = inject(RouteErrorService);
  const pageOptions: RouteErrorOptions = { ...options, ...route.data['accessDenied'] };

  try {
    if (!(await auth.ensureAuthenticated({ returnTo: state.url }))) {
      await auth.login({ returnTo: state.url });
      return false;
    }
    const granted = await firstValueFrom(auth.evaluatePermissions(permissions).pipe(timeout({ first: 10_000 })));
    return granted.length > 0 ? true : errors.guardRedirect(pageOptions.status ?? 403, pageOptions);
  } catch (error: unknown) {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      auth.clearSession();
      await auth.login({ returnTo: state.url });
      return false;
    }
    if (error instanceof HttpErrorResponse && error.status === 403) {
      return errors.guardRedirect(pageOptions.status ?? 403, pageOptions);
    }
    return errors.guardRedirect(503);
  }
};
