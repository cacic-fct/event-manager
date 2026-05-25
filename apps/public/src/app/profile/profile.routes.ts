import { Route } from '@angular/router';

export const routes: Route[] = [
  {
    path: 'attendances',
    title: 'Participações',
    loadChildren: () => import('./attendances/attendances.routes').then((m) => m.routes),
  },
  {
    path: 'wallet',
    title: 'Crachá',
    loadComponent: () => import('./wallet/wallet').then((m) => m.Wallet),
  },
];
