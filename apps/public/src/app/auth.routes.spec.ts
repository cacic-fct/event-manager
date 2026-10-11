import { RenderMode } from '@angular/ssr';
import { authGuard } from '@cacic-fct/shared-angular';
import { appRoutes } from './app.routes';
import { serverRoutes } from './app.routes.server';
import { routes as profileRoutes } from './profile/profile.routes';
import { routes as attendanceRoutes } from './profile/attendance/attendance.routes';

describe('public auth route wiring', () => {
  it('does not declare an admin-style local login route', () => {
    expect(hasRoutePath(appRoutes, 'login')).toBe(false);
  });

  it('keeps preferences available without forcing backend login', () => {
    const preferencesRoute = appRoutes.find((route) => route.path === 'preferences');

    expect(preferencesRoute?.canActivate).toBeUndefined();
  });

  it('keeps offline wallet and attendance routes open while protecting online account tools', () => {
    const profileRoute = appRoutes.find((route) => route.path === 'profile');
    expect(profileRoute?.canActivate).toBeUndefined();
    expect(profileRoute?.canActivateChild).toBeUndefined();

    for (const path of ['wallet', 'wallet/add-card', 'attendances']) {
      const route = profileRoutes.find((candidate) => candidate.path === path);
      expect(route?.canActivate).toBeUndefined();
    }
    for (const path of ['forms/:formId', 'lecturer-profile']) {
      expect(profileRoutes.find((candidate) => candidate.path === path)?.canActivate).toContain(authGuard);
    }

    const organizerRoute = attendanceRoutes.find((route) => route.path === ':eventType/:eventId/organizer');
    const detailRoute = attendanceRoutes.find((route) => route.path === ':eventType/:eventId');
    expect(organizerRoute?.canActivate).toContain(authGuard);
    expect(detailRoute?.canActivate).toBeUndefined();
  });

  it('exposes a public auth error recovery route', () => {
    const authErrorRoute = appRoutes.find((route) => route.path === 'auth/error');

    expect(authErrorRoute?.canActivate).toBeUndefined();
    expect(authErrorRoute?.title).toBe('Erro de login');
    expect(serverRoutes.find((route) => route.path === 'auth/error')?.renderMode).toBe(RenderMode.Server);
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

  it('renders wallet, transfer, and ticket-payment routes only in the browser', () => {
    const ticketRoutePaths = [
      'profile/wallet/tickets/:ticketId',
      'profile/wallet/tickets/:ticketId/transfer',
      'profile/wallet/ticket-transfers',
      'profile/wallet/ticket-transfers/:transferId',
      'major-event/:majorEventId/payment/ticket/:ticketEventId',
    ];

    for (const path of ticketRoutePaths) {
      expect(serverRoutes.find((route) => route.path === path)?.renderMode).toBe(RenderMode.Client);
    }
  });

  it('keeps development-only routes out of production prerendering', () => {
    for (const path of ['dev-tools', 'dev-tools/**']) {
      const routeIndex = serverRoutes.findIndex((route) => route.path === path);

      expect(routeIndex).toBeGreaterThanOrEqual(0);
      expect(routeIndex).toBeLessThan(serverRoutes.findIndex((route) => route.path === '**'));
      expect(serverRoutes[routeIndex].renderMode).toBe(RenderMode.Client);
    }
  });

  it('uses shared error routes for page failures and server-rendered 404 status for unknown paths', () => {
    const errorRoutes = appRoutes.filter((route) => route.path?.startsWith('error/'));
    expect(
      errorRoutes.map((route) => (route.data?.['pageError'] as { status?: number } | undefined)?.status),
    ).toEqual([403, 404, 500, 503]);
    for (const path of ['error/403', 'error/404', 'error/500', 'error/503']) {
      expect(serverRoutes.find((route) => route.path === path)?.renderMode).toBe(RenderMode.Server);
    }
    expect(serverRoutes.find((route) => route.path === '**')?.renderMode).toBe(RenderMode.Server);
  });

  it('retains prerendering for static public pages and client rendering for private preferences', () => {
    for (const path of ['', 'menu', 'calendar', 'notifications', 'about', 'about/legal', 'humans.txt', 'help', 'validate', 'validar', 'legal', 'licenses']) {
      expect(serverRoutes.find((route) => route.path === path)?.renderMode).toBe(RenderMode.Prerender);
    }
    expect(serverRoutes.find((route) => route.path === 'preferences/service-worker')?.renderMode).toBe(RenderMode.Client);
  });
});

function hasRoutePath(routes: typeof appRoutes, path: string): boolean {
  return routes.some((route) => route.path === path || hasRoutePath(route.children ?? [], path));
}
