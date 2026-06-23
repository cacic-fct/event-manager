import { Route } from '@angular/router';

export const routes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./preferences').then((m) => m.Preferences),
    title: 'Preferências',
  },
  {
    path: 'calendar',
    loadComponent: () => import('./calendar-feed-preferences').then((m) => m.CalendarFeedPreferences),
    title: 'Calendário',
  },
];
