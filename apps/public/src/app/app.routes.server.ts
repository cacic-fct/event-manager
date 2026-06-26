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
    path: 'attendance/collect',
    renderMode: RenderMode.Client,
  },
  {
    path: 'attendance/collect/:eventId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'major-event',
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
    path: 'major-event/:majorEventId/ranked-subscription',
    renderMode: RenderMode.Client,
  },
  {
    path: 'major-event/:majorEventId/ranked-subscription/select',
    renderMode: RenderMode.Client,
  },
  {
    path: 'major-event/:majorEventId/ranked-subscription/rank',
    renderMode: RenderMode.Client,
  },
  {
    path: 'major-event/:majorEventId/ranked-subscription/event/:eventId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'major-event/:majorEventId/payment',
    renderMode: RenderMode.Client,
  },
  {
    path: 'profile/lecturer-profile',
    renderMode: RenderMode.Client,
  },
  {
    path: 'preferences',
    renderMode: RenderMode.Client,
  },
  {
    path: 'preferences/calendar',
    renderMode: RenderMode.Client,
  },
  {
    path: 'preview/:previewToken/event',
    renderMode: RenderMode.Client,
  },
  {
    path: 'preview/:previewToken/major-event',
    renderMode: RenderMode.Client,
  },
  {
    path: 'preview/:previewToken/group',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
