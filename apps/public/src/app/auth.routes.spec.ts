import { appRoutes } from './app.routes';

describe('public auth route wiring', () => {
  it('does not declare an admin-style local login route', () => {
    expect(hasRoutePath(appRoutes, 'login')).toBe(false);
  });

  it('keeps preferences available without forcing backend login', () => {
    const preferencesRoute = appRoutes.find((route) => route.path === 'preferences');

    expect(preferencesRoute?.canActivate).toBeUndefined();
  });

  it('exposes a public auth error recovery route', () => {
    const authErrorRoute = appRoutes.find((route) => route.path === 'auth/error');

    expect(authErrorRoute?.canActivate).toBeUndefined();
    expect(authErrorRoute?.title).toBe('Erro de login');
  });
});

function hasRoutePath(routes: typeof appRoutes, path: string): boolean {
  return routes.some((route) => route.path === path || hasRoutePath(route.children ?? [], path));
}
