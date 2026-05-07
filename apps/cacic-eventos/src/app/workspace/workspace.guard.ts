import { inject } from '@angular/core';
import { CanMatchFn, Route } from '@angular/router';
import {
  WorkspacePermissionTab,
  WorkspacePermissionsService,
} from '../shared/services/workspace-permissions.service';

export const workspaceCanReadTabGuard: CanMatchFn = (route: Route) => {
  const permissions = inject(WorkspacePermissionsService);

  const permissionTab = route.data?.['permissionTab'] as
    | WorkspacePermissionTab
    | undefined;

  if (!permissionTab) {
    return true;
  }

  return permissions.canReadTab(permissionTab);
};
