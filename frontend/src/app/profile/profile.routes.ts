import { Routes } from '@angular/router';

import { ProfilePage } from './profile.page';

export const routes: Routes = [
  {
    path: '',
    component: ProfilePage,
  },
  {
    path: 'carteira',
    title: 'Carteira',
    data: { preload: true },
    loadComponent: () => import('./wallet/wallet.page').then((m) => m.WalletPage),
    // TODO: Commented out until we fix data being overwritten
    // ...canActivate(redirectUnauthorizedToLogin),
  },
];
