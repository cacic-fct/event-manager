import { Routes } from '@angular/router';

import { ProfileInfoPage } from './profile-info.page';

export const routes: Routes = [
  {
    path: '',
    component: ProfileInfoPage,
  },
  {
    path: 'carteira',
    data: { preload: true },
    loadComponent: () => import('./wallet/wallet.page').then((m) => m.WalletPage),
  },
];
