import { RenderMode } from '@angular/ssr';
import { appRoutes } from './app.routes';
import { serverRoutes } from './app.routes.server';

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

  it('requires authentication for every prize draw transparency route', () => {
    const drawRoutes = appRoutes.filter((route) => route.path?.startsWith('draws/'));

    expect(drawRoutes).toHaveLength(3);
    expect(drawRoutes.every((route) => (route.canActivate?.length ?? 0) > 0)).toBe(true);
  });

  it('renders authenticated prize draw routes only in the browser', () => {
    const drawRoutes = serverRoutes.filter((route) => route.path.startsWith('draws/'));

    expect(drawRoutes).toHaveLength(3);
    expect(drawRoutes.every((route) => route.renderMode === RenderMode.Client)).toBe(true);
  });
});

function hasRoutePath(routes: typeof appRoutes, path: string): boolean {
  return routes.some((route) => route.path === path || hasRoutePath(route.children ?? [], path));
}
