import { Route } from '@angular/router';

export const routes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./development-tools').then((m) => m.DevelopmentTools),
    title: 'Ferramentas de Desenvolvimento',
  },
  {
    path: 'user',
    loadComponent: () =>
      import('./user-debug/user-debug').then((m) => m.UserDebug),
    title: 'Dados do usuário logado',
  },
  {
    path: 'scanner',
    loadComponent: () =>
      import('./scanner-debug/scanner-debug').then((m) => m.ScannerDebug),
    title: 'Debug de Scanner',
  },
];
