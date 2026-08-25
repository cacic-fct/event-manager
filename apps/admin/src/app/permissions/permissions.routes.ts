import { Route } from '@angular/router';
import { requiredPermissionsGuard } from '@cacic-fct/shared-angular/auth/guard';
import { Permission } from '@cacic-fct/shared-permissions';
import { pendingPermissionChangesGuard } from './management/pending-permission-changes.guard';

export const routes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./permissions-page.component').then((m) => m.PermissionsPageComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'mine' },
      {
        path: 'mine',
        loadComponent: () => import('./my-permissions/my-permissions.component').then((m) => m.MyPermissionsComponent),
      },
      {
        path: 'manage/people/:personId',
        canActivate: [
          requiredPermissionsGuard([Permission.PermissionGrant.Read, Permission.Person.Read], '/permissions/mine'),
        ],
        canDeactivate: [pendingPermissionChangesGuard],
        loadComponent: () =>
          import('./management/permission-management-page.component').then((m) => m.PermissionManagementPageComponent),
      },
      {
        path: 'manage',
        canActivate: [
          requiredPermissionsGuard([Permission.PermissionGrant.Read, Permission.Person.Read], '/permissions/mine'),
        ],
        canDeactivate: [pendingPermissionChangesGuard],
        loadComponent: () =>
          import('./management/permission-management-page.component').then((m) => m.PermissionManagementPageComponent),
      },
    ],
  },
];
