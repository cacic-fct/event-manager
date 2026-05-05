import { Route } from '@angular/router';

export const routes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./attendances').then((m) => m.Attendances),
  },
  {
    path: ':eventType/:eventId',
    loadComponent: () =>
      import('./more-info/more-info').then((m) => m.MoreInfo),
  },
];
