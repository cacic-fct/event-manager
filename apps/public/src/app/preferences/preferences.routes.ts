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
  {
    path: 'service-worker',
    loadComponent: () => import('./service-worker/service-worker').then((m) => m.ServiceWorker),
    title: 'Service Worker',
  },
];
