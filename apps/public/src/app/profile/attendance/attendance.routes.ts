import { Route } from '@angular/router';

export const routes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./list/page').then((m) => m.Attendances),
  },
  {
    path: ':eventType/:eventId/organizer',
    loadComponent: () => import('./organizer-info/page').then((m) => m.OrganizerInfoComponent),
  },
  {
    path: ':eventType/:eventId',
    loadComponent: () => import('./more-info/page').then((m) => m.MoreInfo),
  },
];
