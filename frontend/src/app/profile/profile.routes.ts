import { Routes } from '@angular/router';

import { ProfilePage } from './profile.page';
import { canActivate } from '@angular/fire/compat/auth-guard';
import { redirectUnauthorizedToLogin } from 'src/app/shared/services/routing/guards.service';

export const routes: Routes = [
  {
    path: '',
    component: ProfilePage,
  },
  {
    path: 'carteira',
    data: { preload: true },
    loadComponent: () => import('./wallet/wallet.page').then((m) => m.WalletPage),
    // TODO: Commented out until we fix data being overwritten
    // ...canActivate(redirectUnauthorizedToLogin),
  },
  {
    path: 'codigo',
    loadComponent: () => import('./id-code/id-code.page').then((m) => m.IdCodePage),
    ...canActivate(redirectUnauthorizedToLogin),
  },
];
