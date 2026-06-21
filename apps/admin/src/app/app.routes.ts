import { Route } from '@angular/router';
import { WORKSPACE_ENTRY_PERMISSIONS } from '@cacic-fct/shared-permissions';
import { authGuard, redirectAuthenticatedGuard, requiredPermissionsGuard } from '@cacic-fct/shared-angular';

export const appRoutes: Route[] = [
  {
    path: 'login',
    canActivate: [redirectAuthenticatedGuard([''])],
    loadComponent: () => import('./auth/login-page.component').then((c) => c.LoginPageComponent),
  },
  {
    path: '',
    canActivate: [authGuard, requiredPermissionsGuard(WORKSPACE_ENTRY_PERMISSIONS, '/app/')],
    loadChildren: () => import('./workspace/workspace.routes').then((m) => m.workspaceRoutes),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
