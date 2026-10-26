import '@angular/compiler';
import { RenderMode } from '@angular/ssr';
import { serverRoutes } from './app.routes.server';
import { NOINDEX_HEADERS, shouldNoindexPublicPath } from './search-indexing';

describe('public search indexing', () => {
  it.each([
    '/profile/wallet',
    '/profile/wallet/tickets/ticket-1',
    '/preferences/calendar',
    '/preview/token/major-event',
    '/preview/token/group',
    '/attendance/register/event-1',
    '/notifications',
    '/menu',
    '/sports',
    '/my-day',
    '/draws/event/event-1',
    '/dev-tools',
    '/auth/error',
    '/error/404',
    '/validate/certificate-1',
    '/validar/certificate-1',
    '/validate?certificateId=certificate-1',
    '/validate?invalidId=invalid',
    '/validar?certificateId=certificate-1',
    '/map?participacao=meus',
    '/map?periodo=hoje',
    '/map?evento=event-1',
    '/major-event/major-1/subscription/event/event-1',
    '/major-event/major-1/ranked-subscription/rank',
    '/major-event/major-1/payment/ticket/ticket-1',
    '/tournament/tournament-1/subscribe',
    '/sports/operate/match-1',
    '/sports/team/team-1',
    '/api/version/events',
    '/index.csr.html',
  ])('excludes private and operational URL %s', (path) => {
    expect(shouldNoindexPublicPath(path)).toBe(true);
  });

  it.each([
    '/',
    '/calendar',
    '/major-event',
    '/event/event-1',
    '/tournament/tournament-1',
    '/sports/match/match-1',
    '/map',
    '/about',
    '/about/legal',
    '/help',
    '/validate',
    '/calendar?month=next',
    '/validate?utm_source=test',
  ])('keeps public content eligible at %s', (path) => {
    expect(shouldNoindexPublicPath(path)).toBe(false);
  });

  it('sets HTTP headers for private routes in every render mode', () => {
    const privateRoutes = serverRoutes.filter((route) => shouldNoindexPublicPath(route.path));
    expect(privateRoutes.some((route) => route.renderMode === RenderMode.Client)).toBe(true);
    expect(privateRoutes.some((route) => route.renderMode === RenderMode.Prerender)).toBe(true);
    expect(privateRoutes.some((route) => route.renderMode === RenderMode.Server)).toBe(true);
    for (const route of privateRoutes) {
      expect(route.headers).toEqual(NOINDEX_HEADERS);
    }
    expect(serverRoutes.find((route) => route.path === 'event/:eventId')?.headers).toBeUndefined();
  });
});
