import { isPlatformBrowser } from '@angular/common';
import { inject } from '@angular/core';
import { PLATFORM_ID } from '@angular/core';
import { CanMatchFn, Route } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { EventManagerKeycloakRole, Permission, type WorkspacePermissionTab } from '@cacic-fct/shared-permissions';
import { PermissionsService } from '../permissions/permissions.service';
import { canCreateEventContext } from '../shared/event-context-access';

export const canCreateContextGuard = (async (route: Route) => {
  const permissions = inject(PermissionsService);
  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId)) return true;
  await permissions.evaluateWorkspacePermissions();
  const kind = route.path?.split('/').at(-1);
  return (kind === 'event' || kind === 'group' || kind === 'major-event') && canCreateEventContext(permissions, kind);
}) satisfies CanMatchFn;

export const canReadFeatureGuard: CanMatchFn = async (route: Route) => {
  const permissions = inject(PermissionsService);
  const platformId = inject(PLATFORM_ID);

  const permissionTab = route.data?.['id'] as WorkspacePermissionTab | undefined;

  if (permissionTab === undefined) {
    return true;
  }

  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  await permissions.evaluateWorkspacePermissions();

  return permissions.canReadTab(permissionTab);
};

export const canValidateReceiptsGuard: CanMatchFn = async () => {
  const permissions = inject(PermissionsService);
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  await permissions.evaluateWorkspacePermissions();
  return permissions.has(Permission.Receipt.Read);
};

export const superAdminGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  return auth.roles().includes(EventManagerKeycloakRole.SuperAdmin);
};
