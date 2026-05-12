import { Route } from '@angular/router';
import { authGuard, requiredPermissionsGuard } from '@cacic-fct/shared-angular';

const workspacePermissions = [
  'certificate#read',
  'event#read',
  'event-attendance#read',
  'event-lecturer#read',
  'major-event#read',
  'merge-candidate#read',
  'person#read',
  'subscription#read',
  'user#read',
] as const;

export const appRoutes: Route[] = [
  {
    path: 'login',
    loadComponent: () => import('./auth/login-page.component').then((c) => c.LoginPageComponent),
  },
  {
    path: '',
    canActivate: [authGuard, requiredPermissionsGuard(workspacePermissions, '/app/')],
    loadChildren: () => import('./workspace/workspace.routes').then((m) => m.workspaceRoutes),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
