import { Route } from '@angular/router';

export const routes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./page').then((m) => m.DevelopmentTools),
    title: 'Ferramentas de Desenvolvimento',
  },
  {
    path: 'user',
    loadComponent: () => import('./user-debug/page').then((m) => m.UserDebug),
    title: 'Dados do usuário logado',
  },
  {
    path: 'scanner',
    loadComponent: () => import('./scanner-debug/page').then((m) => m.ScannerDebug),
    title: 'Debug de Scanner',
  },
];
