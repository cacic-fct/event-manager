import { Routes } from '@angular/router';
import { GeneralPage } from './general.page';

export const routes: Routes = [
  {
    path: '',
    component: GeneralPage,
  },
  {
    path: 'service-worker',
    title: 'Service Worker',
    loadComponent: () => import('./service-worker/service-worker.page').then((m) => m.ServiceWorkerPage),
  },
  {
    path: 'sobre',
    title: 'Sobre',
    loadComponent: () => import('./about/about.page').then((m) => m.AboutPage),
  },
  {
    path: 'legal',
    title: 'Legal',
    loadComponent: () => import('../legal/legal.page').then((m) => m.LegalPage),
  },
];
