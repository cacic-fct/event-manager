import { inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanMatchFn, RedirectCommand, Router, UrlTree } from '@angular/router';
import { PLATFORM_ID } from '@angular/core';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors';

/** Restore an admin session before matching protected routes, then start Keycloak login directly. */
export async function ensureAdminAuthentication(
  auth: AuthService,
  router: Router,
  routeErrors: RouteErrorService,
  platformId: object,
): Promise<boolean | UrlTree | RedirectCommand> {
  if (!isPlatformBrowser(platformId)) return true;

  const navigation = router.currentNavigation();
  const target = navigation?.extractedUrl ?? navigation?.initialUrl;
  const returnTo = target ? router.serializeUrl(target) : router.url;

  try {
    if (await auth.ensureAuthenticated({ returnTo })) return true;
    if (auth.consumePostLogoutRedirect()) return router.parseUrl('/login');

    await auth.login({ returnTo });
    return false;
  } catch {
    return routeErrors.guardRedirect(503, {
      description: 'Não foi possível confirmar sua sessão agora. Tente novamente mais tarde.',
    });
  }
}

export async function startAdminLogin(
  auth: AuthService,
  router: Router,
  routeErrors: RouteErrorService,
): Promise<false | RedirectCommand> {
  const navigation = router.currentNavigation();
  const target = navigation?.extractedUrl ?? navigation?.initialUrl;
  try {
    await auth.login({ returnTo: target ? router.serializeUrl(target) : router.url });
    return false;
  } catch {
    return routeErrors.guardRedirect(503);
  }
}

export const adminAuthenticationGuard: CanMatchFn = () =>
  ensureAdminAuthentication(inject(AuthService), inject(Router), inject(RouteErrorService), inject(PLATFORM_ID));
