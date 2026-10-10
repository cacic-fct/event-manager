import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: '',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'menu',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'calendar',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'notifications',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'about',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'about/legal',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'humans.txt',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'help',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'validate',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'validar',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'legal',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'licenses',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'dev-tools',
    renderMode: RenderMode.Client,
  },
  {
    path: 'dev-tools/**',
    renderMode: RenderMode.Client,
  },
  {
    path: 'map',
    renderMode: RenderMode.Client,
  },
  {
    path: 'event/:eventId',
    renderMode: RenderMode.Server,
  },
  {
    path: 'draws/event/:eventId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'draws/event-group/:eventGroupId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'draws/major-event/:majorEventId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'tournament/:tournamentId',
    renderMode: RenderMode.Server,
  },
  {
    path: 'sports/match/:matchId',
    renderMode: RenderMode.Server,
  },
  {
    path: 'tournament/:tournamentId/subscribe',
    renderMode: RenderMode.Client,
  },
  {
    path: 'sports/operate/:matchId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'sports/team/:teamId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'sports',
    renderMode: RenderMode.Client,
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
    path: 'profile/wallet',
    renderMode: RenderMode.Client,
  },
  {
    path: 'profile/wallet/add-card',
    renderMode: RenderMode.Client,
  },
  {
    path: 'profile/wallet/tickets/:ticketId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'profile/wallet/tickets/:ticketId/transfer',
    renderMode: RenderMode.Client,
  },
  {
    path: 'profile/wallet/ticket-transfers',
    renderMode: RenderMode.Client,
  },
  {
    path: 'profile/wallet/ticket-transfers/:transferId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'profile/forms/:formId',
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
    path: 'attendance/collect/:eventId/method',
    renderMode: RenderMode.Client,
  },
  {
    path: 'attendance/collect/:eventId/scanner',
    renderMode: RenderMode.Client,
  },
  {
    path: 'attendance/collect/:eventId/oral',
    renderMode: RenderMode.Client,
  },
  {
    path: 'auth/error',
    renderMode: RenderMode.Server,
  },
  {
    path: 'major-event',
    renderMode: RenderMode.Client,
  },
  {
    path: 'my-day',
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
    path: 'major-event/:majorEventId/payment/ticket/:ticketEventId',
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
    path: 'preferences/service-worker',
    renderMode: RenderMode.Client,
  },
  {
    path: 'error/403',
    renderMode: RenderMode.Server,
  },
  {
    path: 'error/404',
    renderMode: RenderMode.Server,
  },
  {
    path: 'error/500',
    renderMode: RenderMode.Server,
  },
  {
    path: 'error/503',
    renderMode: RenderMode.Server,
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
    renderMode: RenderMode.Server,
  },
];
