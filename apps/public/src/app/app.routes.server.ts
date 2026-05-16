import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'event/:eventId',
    renderMode: RenderMode.Server,
  },
  {
    path: 'profile/attendances',
    renderMode: RenderMode.Client,
  },
  {
    path: 'profile/attendances/:eventType/:eventId/organizer',
    renderMode: RenderMode.Client,
  },
  {
    path: 'profile/attendances/:eventType/:eventId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'attendance/register',
    renderMode: RenderMode.Client,
  },
  {
    path: 'attendance/register/:eventId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'validate/:certificateId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'validar/:certificateId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'major-event/:majorEventId/subscription',
    renderMode: RenderMode.Client,
  },
  {
    path: 'major-event/:majorEventId/subscription/event/:eventId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'major-event/:majorEventId/payment',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
