import { Route } from '@angular/router';
import { authGuard } from '@cacic-eventos/shared-angular';

export const appRoutes: Route[] = [
  {
    path: 'login',
    loadComponent: () =>
      import('./auth/login-page.component').then((c) => c.LoginPageComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./workspace/workspace.routes').then((m) => m.workspaceRoutes),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
