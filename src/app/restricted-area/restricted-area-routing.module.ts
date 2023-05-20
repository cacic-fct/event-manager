// @ts-strict-ignore
import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { RestrictedAreaPage } from './restricted-area.page';

import { canActivate } from '@angular/fire/compat/auth-guard';
import { adminOnly } from '../shared/services/routing/guards.service';

const routes: Routes = [
  {
    path: '',
    component: RestrictedAreaPage,
  },
  {
    path: 'gerenciar-admins',
    title: 'Gerenciar admins',
    loadChildren: () =>
      import('src/app/restricted-area/manage-admins/manage-admins.module').then((m) => m.ManageAdminsPageModule),
    ...canActivate(adminOnly),
  },
  {
    path: 'gerenciar-grandes-eventos',
    title: 'Gerenciar grandes eventos',
    loadChildren: () =>
      import('./manage-major-events/manage-major-events.module').then((m) => m.ManageMajorEventsPageModule),
    ...canActivate(adminOnly),
  },
  {
    path: 'gerenciar-eventos',
    title: 'Gerenciar eventos',
    loadChildren: () => import('./manage-events/manage-events.module').then((m) => m.ManageEventsPageModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class RestrictedAreaPageRoutingModule {}
