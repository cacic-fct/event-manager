import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { PLATFORM_ID } from '@angular/core';
import { CanMatchFn, RedirectCommand, Route, Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors';
import { EventManagerKeycloakRole, Permission, type WorkspacePermissionTab } from '@cacic-fct/shared-permissions';
import { PermissionsService } from '../permissions/permissions.service';
import { canCreateEventContext } from '../shared/event-context-access';
import { ensureAdminAuthentication, startAdminLogin } from '../auth/admin-auth.guard';

export const canCreateContextGuard = (async (route: Route) => {
  const auth = inject(AuthService);
  const permissions = inject(PermissionsService);
  const platformId = inject(PLATFORM_ID);
  const routeErrors = inject(RouteErrorService);
  const router = inject(Router);
  if (!isPlatformBrowser(platformId)) return true;
  const authenticated = await ensureAdminAuthentication(auth, router, routeErrors, platformId);
  if (authenticated !== true) return authenticated;
  try {
    await permissions.evaluateWorkspacePermissions();
    const kind = route.path?.split('/').at(-1);
    return (kind === 'event' || kind === 'group' || kind === 'major-event') && canCreateEventContext(permissions, kind)
      ? true
      : routeErrors.guardRedirect(403);
  } catch (error: unknown) {
    return routePermissionFailure(auth, router, routeErrors, error);
  }
}) satisfies CanMatchFn;

export const canReadFeatureGuard: CanMatchFn = async (route: Route) => {
  const auth = inject(AuthService);
  const permissions = inject(PermissionsService);
  const platformId = inject(PLATFORM_ID);
  const routeErrors = inject(RouteErrorService);
  const router = inject(Router);

  const permissionTab = route.data?.['id'] as WorkspacePermissionTab | undefined;

  if (permissionTab === undefined) {
    return true;
  }

  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  const authenticated = await ensureAdminAuthentication(auth, router, routeErrors, platformId);
  if (authenticated !== true) return authenticated;

  try {
    await permissions.evaluateWorkspacePermissions();
    return permissions.canReadTab(permissionTab) ? true : routeErrors.guardRedirect(403);
  } catch (error: unknown) {
    return routePermissionFailure(auth, router, routeErrors, error);
  }
};

export const canValidateReceiptsGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const permissions = inject(PermissionsService);
  const platformId = inject(PLATFORM_ID);
  const routeErrors = inject(RouteErrorService);
  const router = inject(Router);

  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  const authenticated = await ensureAdminAuthentication(auth, router, routeErrors, platformId);
  if (authenticated !== true) return authenticated;

  try {
    await permissions.evaluateWorkspacePermissions();
    return permissions.has(Permission.Receipt.Read) ? true : routeErrors.guardRedirect(403);
  } catch (error: unknown) {
    return routePermissionFailure(auth, router, routeErrors, error);
  }
};

function routePermissionFailure(
  auth: AuthService,
  router: Router,
  routeErrors: RouteErrorService,
  error: unknown,
): Promise<false | RedirectCommand> | RedirectCommand {
  if (error instanceof HttpErrorResponse && error.status === 401) {
    auth.clearSession();
    return startAdminLogin(auth, router, routeErrors);
  }

  return routeErrors.guardRedirect(error instanceof HttpErrorResponse && error.status === 403 ? 403 : 503);
}

export const superAdminGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  const platformId = inject(PLATFORM_ID);
  const routeErrors = inject(RouteErrorService);
  const router = inject(Router);

  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  return ensureAdminAuthentication(auth, router, routeErrors, platformId).then((authenticated) => {
    if (authenticated !== true) return authenticated;
    return auth.roles().includes(EventManagerKeycloakRole.SuperAdmin) ? true : routeErrors.guardRedirect(403);
  });
};
