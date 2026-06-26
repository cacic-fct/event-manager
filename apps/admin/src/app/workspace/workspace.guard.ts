import { isPlatformBrowser } from '@angular/common';
import { inject } from '@angular/core';
import { PLATFORM_ID } from '@angular/core';
import { CanMatchFn, Route } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { EventManagerKeycloakRole, Permission, type WorkspacePermissionTab } from '@cacic-fct/shared-permissions';
import { WorkspacePermissionsService } from '../shared/services/workspace-permissions.service';

export const workspaceCanReadTabGuard: CanMatchFn = async (route: Route) => {
  const permissions = inject(WorkspacePermissionsService);
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
  const permissions = inject(WorkspacePermissionsService);
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  await permissions.evaluateWorkspacePermissions();
  return permissions.has(Permission.Receipt.Read);
};

export const workspaceSuperAdminGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  return auth.roles().includes(EventManagerKeycloakRole.SuperAdmin);
};
