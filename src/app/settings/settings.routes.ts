import { Routes } from '@angular/router';
import { SettingsPage } from './settings.page';
import { redirectUnauthorizedToLogin } from 'src/app/shared/services/routing/guards.service';
import { canActivate } from '@angular/fire/compat/auth-guard';

export const routes: Routes = [
  {
    path: '',
    component: SettingsPage,
  },
  {
    path: 'geral',
    title: 'Geral',
    loadChildren: () => import('./general/general.routes').then((m) => m.routes),
  },
  {
    path: 'privacidade',
    title: 'Privacidade',
    loadComponent: () => import('./privacy/privacy.page').then((m) => m.PrivacyPage),
  },
  {
    path: 'legal',
    title: 'Legal',
    loadChildren: () => import('./legal/legal.routes').then((m) => m.routes),
  },
  {
    path: 'suporte',
    title: 'Suporte',
    data: {
      preload: true,
    },
    loadComponent: () => import('./support/support.page').then((m) => m.SupportPage),
  },
  {
    path: 'conta',
    loadChildren: () => import('./account/account.routes').then((m) => m.routes),
    ...canActivate(redirectUnauthorizedToLogin),
  },
];
