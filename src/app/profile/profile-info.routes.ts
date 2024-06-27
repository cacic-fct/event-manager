import { Routes } from '@angular/router';

import { ProfileInfoPage } from './profile-info.page';
// import { redirectUnauthorizedToLogin } from 'src/app/shared/services/routing/guards.service';
// import { canActivate } from '@angular/fire/compat/auth-guard';

export const routes: Routes = [
  {
    path: '',
    component: ProfileInfoPage,
  },
  {
    path: 'carteira',
    data: { preload: true },
    loadComponent: () => import('./wallet/wallet.page').then((m) => m.WalletPage),
    // TODO: Commented out until we fix data being overwritten
    // ...canActivate(redirectUnauthorizedToLogin),
  },
];
