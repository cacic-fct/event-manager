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
    loadComponent: () => import('./calendar-preferences/calendar-preferences').then((m) => m.CalendarPreferences),
    title: 'Calendário',
  },
];
