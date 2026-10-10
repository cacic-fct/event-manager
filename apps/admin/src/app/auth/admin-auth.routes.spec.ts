import { appRoutes } from '../app.routes';
import { adminAuthenticationGuard } from './admin-auth.guard';

describe('admin route authentication and error wiring', () => {
  it('keeps the local development login page explicit while protecting the workspace with direct SSO auth', () => {
    expect(appRoutes.some((route) => route.path === 'login')).toBe(true);

    const workspaceRoute = appRoutes.find((route) => route.path === '');

    expect(workspaceRoute?.canMatch).toContain(adminAuthenticationGuard);
    expect(workspaceRoute?.canActivate).toHaveLength(1);
  });

  it('routes each shared error status to the shared error page and keeps unknown routes at 404', () => {
    const errorRoutes = appRoutes.filter((route) => route.path?.startsWith('error/'));
    const wildcardRoute = appRoutes.find((route) => route.path === '**');

    expect(errorRoutes.map((route) => route.path)).toEqual([
      'error/403',
      'error/404',
      'error/500',
      'error/503',
    ]);
    expect(errorRoutes.map((route) => route.data?.['pageError'])).toEqual([
      { status: 403, actionHref: '/app/', actionLabel: 'Voltar para os eventos' },
      { status: 404, actionHref: '/app/', actionLabel: 'Voltar para os eventos' },
      { status: 500, actionHref: '/app/', actionLabel: 'Voltar para os eventos' },
      { status: 503, actionHref: '/app/', actionLabel: 'Voltar para os eventos' },
    ]);
    expect(errorRoutes.every((route) => route.loadComponent === errorRoutes[0].loadComponent)).toBe(true);
    expect(wildcardRoute?.data?.['pageError']).toEqual({
      status: 404,
      actionHref: '/app/',
      actionLabel: 'Voltar para os eventos',
    });
    expect(wildcardRoute?.loadComponent).toBe(errorRoutes[0].loadComponent);
  });
});
