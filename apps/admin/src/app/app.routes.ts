import { Route } from '@angular/router';
import { WORKSPACE_ENTRY_PERMISSIONS } from '@cacic-fct/shared-permissions';
import { requiredPermissionsGuard } from '@cacic-fct/shared-angular/auth/guard';
import type { PageErrorStatus } from '@cacic-fct/shared-angular/errors';
import { redirectAuthenticatedGuard } from '@cacic-fct/shared-angular/redirect-authenticated';
import { adminAuthenticationGuard } from './auth/admin-auth.guard';

const errorStatuses = [403, 404, 500, 503] as const satisfies readonly PageErrorStatus[];

const loadErrorPage = () => import('./shared/error-page').then((module) => module.ErrorPage);

export const appRoutes: Route[] = [
  {
    path: 'login',
    canActivate: [redirectAuthenticatedGuard([''])],
    loadComponent: () => import('./auth/login-page.component').then((c) => c.LoginPageComponent),
  },
  ...errorStatuses.map((status): Route => ({
    path: `error/${status}`,
    data: {
      pageError: {
        status,
        actionHref: '/app/',
        actionLabel: 'Voltar para os eventos',
      },
    },
    loadComponent: loadErrorPage,
  })),
  {
    path: '',
    canMatch: [adminAuthenticationGuard],
    canActivate: [requiredPermissionsGuard(WORKSPACE_ENTRY_PERMISSIONS)],
    loadChildren: () => import('./app-shell/admin-shell.routes').then((m) => m.routes),
  },
  {
    path: '**',
    data: {
      pageError: {
        status: 404,
        actionHref: '/app/',
        actionLabel: 'Voltar para os eventos',
      },
    },
    loadComponent: loadErrorPage,
  },
];
