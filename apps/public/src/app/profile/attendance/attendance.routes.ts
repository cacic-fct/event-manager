import { Route } from '@angular/router';
import { authGuard } from '@cacic-fct/shared-angular';

export const routes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./list/attendances').then((m) => m.Attendances),
  },
  {
    path: ':eventType/:eventId/organizer',
    canActivate: [authGuard],
    loadComponent: () => import('./organizer-info/organizer-info').then((m) => m.OrganizerInfoComponent),
  },
  {
    path: ':eventType/:eventId',
    loadComponent: () => import('./more-info/more-info').then((m) => m.MoreInfo),
  },
];
