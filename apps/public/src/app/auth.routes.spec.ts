import { appRoutes } from './app.routes';

describe('public auth route wiring', () => {
  it('does not declare an admin-style local login route', () => {
    expect(hasRoutePath(appRoutes, 'login')).toBe(false);
  });

  it('keeps preferences available without forcing backend login', () => {
    const preferencesRoute = appRoutes.find((route) => route.path === 'preferences');

    expect(preferencesRoute?.canActivate).toBeUndefined();
  });
});

function hasRoutePath(routes: typeof appRoutes, path: string): boolean {
  return routes.some((route) => route.path === path || hasRoutePath(route.children ?? [], path));
}
