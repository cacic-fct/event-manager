import { Route } from '@angular/router';

export const routes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./page').then((m) => m.Preferences),
    title: 'Preferências',
  },
  {
    path: 'calendar',
    loadComponent: () => import('./calendar/page').then((m) => m.CalendarPreferences),
    title: 'Calendário',
  },
  {
    path: 'service-worker',
    loadComponent: () => import('./service-worker/page').then((m) => m.ServiceWorker),
    title: 'Service Worker',
  },
];
