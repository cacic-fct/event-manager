import { NgModule } from '@angular/core';
import { canActivate, redirectUnauthorizedTo } from '@angular/fire/compat/auth-guard';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const redirectUnauthorizedToLogin = () => redirectUnauthorizedTo(['menu']);

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./tabs/tabs.module').then((m) => m.TabsPageModule),
  },
  {
    path: 'about',
    loadChildren: () => import('./page-about/page-about.module').then((m) => m.PageAboutPageModule),
  },
  {
    path: 'licenses',
    loadChildren: () => import('./page-about/page-licenses/page-licenses.module').then((m) => m.PageLegalPageModule),
  },
  {
    path: 'manual-do-calouro',
    loadChildren: () =>
      import('./page-manual-calouro/page-manual-calouro.module').then((m) => m.PageManualCalouroPageModule),
  },
  {
    path: 'calouros',
    loadChildren: () => import('./page-calouros/page-calouros.module').then((m) => m.PageCalourosPageModule),
  },
  {
    path: 'scan',
    loadChildren: () =>
      import('./page-qr-scanner-public/page-qr-scanner.module').then((m) => m.PageQrScannerPageModule),
    ...canActivate(redirectUnauthorizedToLogin),
  },
  {
    path: 'register',
    loadChildren: () => import('./page-register/page-register.module').then((m) => m.PageRegisterPageModule),
    ...canActivate(redirectUnauthorizedToLogin),
  },
  {
    path: 'profile',
    loadChildren: () => import('./page-profile/page-profile.module').then((m) => m.PageProfilePageModule),
    ...canActivate(redirectUnauthorizedToLogin),
  },
];
@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
