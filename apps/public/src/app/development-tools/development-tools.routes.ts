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
    title: 'Desenvolvimento de Usuário',
  },
];
