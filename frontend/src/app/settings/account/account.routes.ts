import { Routes } from '@angular/router';
import { redirectUnauthorizedToLogin } from 'src/app/shared/services/routing/guards.service';
import { canActivate } from '@angular/fire/compat/auth-guard';
import { AccountPage } from 'src/app/settings/account/account.page';

export const routes: Routes = [
  {
    path: '',
    component: AccountPage,
  },
  {
    path: 'register',
    title: 'Informações pessoais',
    loadComponent: () => import('src/app/settings/account/register/register.page').then((m) => m.RegisterPage),
    ...canActivate(redirectUnauthorizedToLogin),
  },
];
