// @ts-strict-ignore
import { Routes } from '@angular/router';

import { RestrictedAreaPage } from './restricted-area.page';

import { canActivate } from '@angular/fire/compat/auth-guard';
import { adminOnly } from '../shared/services/routing/guards.service';

export const routes: Routes = [
  {
    path: '',
    component: RestrictedAreaPage,
  },
  {
    path: 'gerenciar-admins',
    title: 'Gerenciar admins',
    loadChildren: () => import('src/app/restricted-area/manage-admins/manage-admins.routes').then((m) => m.routes),
    ...canActivate(adminOnly),
  },
  {
    path: 'gerenciar-grandes-eventos',
    title: 'Gerenciar grandes eventos',
    loadChildren: () => import('./manage-major-events/manage-major-events.routes').then((m) => m.routes),
    ...canActivate(adminOnly),
  },
  {
    path: 'gerenciar-eventos',
    title: 'Gerenciar eventos',
    loadChildren: () => import('./manage-events/manage-events.routes').then((m) => m.routes),
  },
  {
    path: 'leitor-codigo-barras',
    title: 'Leitor de código de barras',
    loadComponent: () =>
      import('../development-tools/barcode-scanner/barcode-scanner.page').then((m) => m.BarcodeScannerPage),
  },
];
