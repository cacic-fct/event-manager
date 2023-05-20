// @ts-strict-ignore
import { NgModule } from '@angular/core';
import { canActivate } from '@angular/fire/compat/auth-guard';
import { RouterModule, Routes } from '@angular/router';
import { PreloadingStrategyService } from './shared/services/routing/preloading-strategy.service';

import {
  DevelopmentOnlyGuard,
  redirectUnauthorizedToLogin,
  redirectLoggedInToMenu,
} from './shared/services/routing/guards.service';

const routes: Routes = [
  // Development environment only
  {
    path: 'development-tools',
    loadChildren: () =>
      import('./development-tools/development-tools.module').then((m) => m.DevelopmentToolsPageModule),
    canActivate: [DevelopmentOnlyGuard],
  },
  // General routes
  {
    path: '',
    data: { preload: true },
    loadChildren: () => import('./tabs/tabs.module').then((m) => m.TabsPageModule),
  },
  {
    path: 'sobre',
    data: { preload: true },
    title: 'Sobre',
    loadChildren: () => import('./about/about.module').then((m) => m.AboutPageModule),
  },
  {
    path: 'privacidade',
    data: { preload: true },
    title: 'Política de privacidade',
    loadChildren: () => import('./about/privacy-policy/privacy-policy.module').then((m) => m.PrivacyPolicyPageModule),
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
    loadChildren: () => import('./about/licenses/licenses.module').then((m) => m.PageLegalPageModule),
  },
  {
    path: 'manual-do-calouro',
    title: 'Manual do Calouro',
    loadChildren: () => import('src/app/freshmen/manual/manual.module').then((m) => m.ManualPageModule),
  },
  {
    path: 'calouros',
    title: 'Página dos calouros',
    loadChildren: () => import('src/app/freshmen/welcome/welcome.module').then((m) => m.WelcomePageModule),
  },
  // Unused route
  // {
  //   path: 'scan',
  //   title: 'Escanear',
  //   loadChildren: () =>
  //     import('./page-qr-scanner-public/page-qr-scanner.module').then((m) => m.PageQrScannerPageModule),
  //   ...canActivate(redirectUnauthorizedToLogin),
  // },
  {
    path: 'login',
    loadChildren: () => import('src/app/auth/login/login.module').then((m) => m.LoginPageModule),
    ...canActivate(redirectLoggedInToMenu),
  },
  {
    path: 'register',
    title: 'Registro',
    loadChildren: () => import('src/app/auth/register/register.module').then((m) => m.RegisterPageModule),
    ...canActivate(redirectUnauthorizedToLogin),
  },
  {
    path: 'perfil',
    title: 'Perfil',
    data: { preload: true },
    loadChildren: () => import('src/app/profile/profile-info/profile-info.module').then((m) => m.ProfileInfoPageModule),
    ...canActivate(redirectUnauthorizedToLogin),
  },
  {
    path: 'entidades',
    title: 'Entidades estudantis',
    loadChildren: () =>
      import('src/app/freshmen/student-organizations/student-organizations.module').then(
        (m) => m.StudentOrganizationsPageModule
      ),
  },
  {
    path: 'eventos/inscrever/:eventID',
    title: 'Inscrição',
    loadChildren: () =>
      import('src/app/tabs/major-events-display/subscribe/subscribe.module').then((m) => m.SubscribePageModule),
    ...canActivate(redirectUnauthorizedToLogin),
  },
  {
    path: 'inscricoes',
    title: 'Minhas participações',
    loadChildren: () =>
      import('src/app/profile/my-attendances/my-attendances.module').then((m) => m.MyAttendancesPageModule),
    ...canActivate(redirectUnauthorizedToLogin),
  },
  {
    path: 'confirmar-presenca/:eventID',
    title: 'Confirmar presença em um evento',
    loadChildren: () =>
      import('src/app/modals/confirm-attendance/confirm-attendance.module').then((m) => m.ConfirmAttendancePageModule),
    ...canActivate(redirectUnauthorizedToLogin),
  },
  {
    path: 'certificado/verificar/:param',
    loadChildren: () =>
      import('./validate-certificate/validate-certificate.module').then((m) => m.ValidateCertificatePageModule),
  },
  // Redirect not found routes (404) to index
  // Must be the last route
  {
    path: '**',
    redirectTo: '',
  },
];
@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: PreloadingStrategyService })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
