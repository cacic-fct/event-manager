import { RenderMode } from '@angular/ssr';
import { PAGE_ERROR_HEADERS } from '@cacic-fct/shared-angular/errors';
import { serverRoutes } from './app.routes.server';

describe('admin SSR route modes', () => {
  it('keeps every configured admin route in CSR, including lazy and custom-matcher routes', () => {
    const clientPaths = serverRoutes
      .filter((route) => route.renderMode === RenderMode.Client)
      .map((route) => route.path);

    expect(clientPaths).toContain('');
    expect(clientPaths).toContain('permissions/manage/people/:personId');
    expect(clientPaths).toContain('draws/:drawId/draw');
    expect(clientPaths).toContain('event-workspace/event/:targetId/settings');
    expect(clientPaths).toContain('sports/major-event/:majorEventId/:area/:entityId/:matchId');
    expect(clientPaths).not.toContain('**');
  });

  it('renders shared error URLs with their HTTP status and private response headers', () => {
    for (const status of [403, 404, 500, 503] as const) {
      expect(serverRoutes).toContainEqual({
        path: `error/${status}`,
        renderMode: RenderMode.Server,
        status,
        headers: PAGE_ERROR_HEADERS,
      });
    }
  });

  it('renders unmatched admin URLs on the server so the shared 404 page can set the response status', () => {
    expect(serverRoutes.at(-1)).toEqual({ path: '**', renderMode: RenderMode.Server });
  });
});
