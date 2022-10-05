import { NgModule } from '@angular/core';
import { canActivate, redirectLoggedInTo, redirectUnauthorizedTo } from '@angular/fire/compat/auth-guard';
import { ActivatedRouteSnapshot, RouterModule, RouterStateSnapshot, Routes } from '@angular/router';
import { PreloadingStrategyService } from './shared/services/preloading-strategy.service';

// Attribution: waternova
// https://stackoverflow.com/questions/64456664/angularfireauthguard-redirecturl-after-login
const redirectUnauthorizedToLogin = (next: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  return redirectUnauthorizedTo(`/login?redirect=${state.url}`);
};

const redirectLoggedInToMenu = () => redirectLoggedInTo(['menu']);

const routes: Routes = [
  {
    path: '',
    data: { preload: true },
    loadChildren: () => import('./tabs/tabs.module').then((m) => m.TabsPageModule),
  },
  {
    path: 'sobre',
    data: { preload: true },
    title: 'Sobre',
    loadChildren: () => import('./page-about/page-about.module').then((m) => m.PageAboutPageModule),
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
    loadChildren: () => import('./page-about/page-licenses/page-licenses.module').then((m) => m.PageLegalPageModule),
  },
  {
    path: 'manual-do-calouro',
    title: 'Manual do Calouro',
    loadChildren: () =>
      import('./page-manual-calouro/page-manual-calouro.module').then((m) => m.PageManualCalouroPageModule),
  },
  {
    path: 'calouros',
    title: 'Página dos calouros',
    loadChildren: () => import('./page-calouros/page-calouros.module').then((m) => m.PageCalourosPageModule),
  },
  {
    path: 'scan',
    title: 'Escanear',
    loadChildren: () =>
      import('./page-qr-scanner-public/page-qr-scanner.module').then((m) => m.PageQrScannerPageModule),
    ...canActivate(redirectUnauthorizedToLogin),
  },
  {
    path: 'login',
    loadChildren: () => import('./page-login/page-login.module').then((m) => m.PageLoginPageModule),
    ...canActivate(redirectLoggedInToMenu),
  },
  {
    path: 'register',
    title: 'Registro',
    loadChildren: () => import('./page-register/page-register.module').then((m) => m.PageRegisterPageModule),
    ...canActivate(redirectUnauthorizedToLogin),
  },
  {
    path: 'profile',
    title: 'Perfil',
    data: { preload: true },
    loadChildren: () => import('./page-profile/page-profile.module').then((m) => m.PageProfilePageModule),
    ...canActivate(redirectUnauthorizedToLogin),
  },
  {
    path: 'entidades',
    title: 'Entidades estudantis',
    loadChildren: () => import('./page-contact-cas/page-contact-cas.module').then((m) => m.PageContactCasPageModule),
  },
  {
    path: 'eventos/inscrever/:eventID',
    title: 'Inscrição',
    loadChildren: () =>
      import('./page-subscription/page-subscription.module').then((m) => m.PageSubscriptionPageModule),
    ...canActivate(redirectUnauthorizedToLogin),
  },
  {
    path: 'inscricoes',
    title: 'Minhas inscrições',
    loadChildren: () =>
      import('./page-subscriptions-payments/page-subscriptions.module').then((m) => m.PageSubscriptionsPageModule),
    ...canActivate(redirectUnauthorizedToLogin),
  },
  {
    path: 'page-debug',
    loadChildren: () => import('./page-debug/page-debug.module').then((m) => m.PageDebugPageModule),
  },
];
@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: PreloadingStrategyService })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
