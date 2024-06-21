import { canActivate } from '@angular/fire/compat/auth-guard';
import { Routes } from '@angular/router';

import {
  DevelopmentOnlyGuard,
  redirectUnauthorizedToLogin,
  redirectLoggedInToMenu,
} from './shared/services/routing/guards.service';

export const routes: Routes = [
  // Development environment only
  {
    path: 'development-tools',
    loadChildren: () => import('./development-tools/development-tools.routes').then((m) => m.routes),
    canActivate: [DevelopmentOnlyGuard],
  },
  // General routes
  {
    path: '',
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
  {
    path: 'sobre',
    title: 'Sobre',
    loadChildren: () => import('./about/about.routes').then((m) => m.routes),
  },
  {
    path: 'privacidade',
    title: 'Política de privacidade',
    loadChildren: () => import('./about/privacy-policy/privacy-policy.routes').then((m) => m.routes),
  },
  {
    path: 'privacy',
    redirectTo: 'privacidade',
    pathMatch: 'full',
  },
  {
    path: 'privacy-policy',
    redirectTo: 'privacidade',
    pathMatch: 'full',
  },
  {
    path: 'politica-de-privacidade',
    redirectTo: 'privacidade',
    pathMatch: 'full',
  },
  {
    path: 'about',
    redirectTo: 'sobre',
    pathMatch: 'full',
  },
  {
    path: 'humans.txt',
    redirectTo: 'sobre',
    pathMatch: 'full',
  },
  {
    path: 'licenses',
    redirectTo: 'sobre/licencas',
    pathMatch: 'full',
  },
  {
    path: 'sobre/licencas',
    title: 'Licenças',
    loadChildren: () => import('./about/licenses/licenses.routes').then((m) => m.routes),
  },
  // Unused route
  // {
  //   path: 'scan',
  //   title: 'Escanear',
  //   loadComponent: () =>
  //     import('./page-qr-scanner-public/page-qr-scanner.page').then((m) => m.PageQrScannerPage),
  //   ...canActivate(redirectUnauthorizedToLogin),
  // },
  {
    path: 'login',
    title: 'Entrar',
    loadComponent: () => import('src/app/auth/login/login.page').then((m) => m.LoginPage),
    ...canActivate(redirectLoggedInToMenu),
  },
  {
    path: 'register',
    title: 'Registrar-se',
    loadComponent: () => import('src/app/profile/register/register.page').then((m) => m.RegisterPage),
    ...canActivate(redirectUnauthorizedToLogin),
  },
  {
    path: 'perfil',
    title: 'Perfil',
    data: { preload: true },
    loadChildren: () => import('src/app/profile/profile-info.routes').then((m) => m.routes),
    canActivate: [redirectUnauthorizedToLogin],
  },
  {
    path: 'eventos/inscrever/:eventID',
    title: 'Inscrição',
    loadChildren: () => import('src/app/tabs/major-events-display/subscribe/subscribe.routes').then((m) => m.routes),
    ...canActivate(redirectUnauthorizedToLogin),
  },
  {
    path: 'inscricoes',
    title: 'Minhas participações',
    loadChildren: () => import('src/app/profile/my-attendances/my-attendances.routes').then((m) => m.routes),
    ...canActivate(redirectUnauthorizedToLogin),
  },
  {
    path: 'confirmar-presenca/:eventID',
    title: 'Confirmar presença',
    loadChildren: () => import('src/app/modals/confirm-attendance/confirm-attendance.routes').then((m) => m.routes),
    ...canActivate(redirectUnauthorizedToLogin),
  },
  {
    path: 'certificado/verificar/:param',
    loadChildren: () => import('./validate-certificate/validate-certificate.routes').then((m) => m.routes),
  },
  {
    path: 'docs',
    loadComponent: () => import('./redirects/docs/docs.page').then((m) => m.DocsPage),
  },
  {
    path: 'documentacao',
    redirectTo: 'docs',
  },
  {
    path: 'documentação',
    redirectTo: 'docs',
  },
  {
    path: 'documentation',
    redirectTo: 'docs',
  },
  // Redirect not found routes (404) to index
  // Must be the last route
  {
    path: '**',
    redirectTo: '',
  },
];
