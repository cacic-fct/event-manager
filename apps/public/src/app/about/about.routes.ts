import { Route } from '@angular/router';

export const routes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./about').then((m) => m.About),
    title: 'Sobre',
  },
  {
    path: 'legal',
    loadComponent: () => import('./legal/legal').then((m) => m.Legal),
    title: 'Legal',
  },
];
