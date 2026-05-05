import { Route } from '@angular/router';

export const routes: Route[] = [
  {
    path: 'attendances',
    loadChildren: () =>
      import('./attendances/attendances.routes').then((m) => m.routes),
  },
  {
    path: 'wallet',
    loadComponent: () => import('./wallet/wallet').then((m) => m.Wallet),
  },
];
