import { Route } from '@angular/router';

export const routes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./my-attendances/attendances').then((m) => m.Attendances),
  },
  {
    path: ':eventType/:eventId/organizer',
    loadComponent: () => import('./organizer-info/organizer-info').then((m) => m.OrganizerInfoComponent),
  },
  {
    path: 'lecturer-profile',
    loadComponent: () => import('./lecturer-profile/lecturer-profile').then((m) => m.LecturerProfileComponent),
  },
  {
    path: ':eventType/:eventId',
    loadComponent: () => import('./more-info/more-info').then((m) => m.MoreInfo),
  },
];
