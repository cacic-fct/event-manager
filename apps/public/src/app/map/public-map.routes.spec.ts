import { RenderMode } from '@angular/ssr';
import { appRoutes } from '../app.routes';
import { serverRoutes } from '../app.routes.server';

describe('public map routing', () => {
  it('registers a top-level lazy map page with its document title', async () => {
    const route = appRoutes.find(({ path }) => path === 'map');

    expect(route).toEqual(expect.objectContaining({ path: 'map', title: 'Mapa de eventos' }));
    await expect(route?.loadComponent?.()).resolves.toEqual(expect.any(Function));
  });

  it('uses client rendering because the map relies on browser-only APIs', () => {
    expect(serverRoutes.find(({ path }) => path === 'map')).toEqual({
      path: 'map',
      renderMode: RenderMode.Client,
    });
  });
});
