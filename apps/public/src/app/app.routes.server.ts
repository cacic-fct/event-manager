import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'event/:eventId',
    renderMode: RenderMode.Server,
  },
  {
    path: 'profile/attendances/:eventType/:eventId',
    renderMode: RenderMode.Server,
  },
  {
    path: 'validate/:certificateId',
    renderMode: RenderMode.Server,
  },
  {
    path: 'validar/:certificateId',
    renderMode: RenderMode.Server,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
