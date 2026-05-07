import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'events/:eventId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'groups/:groupId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'major-events/:majorEventId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'people/:personId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'certificates/:targetType/:targetId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'certificates/:targetType/:targetId/:configId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'attendances/event/:eventId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'attendances/major-event/:majorEventId',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
