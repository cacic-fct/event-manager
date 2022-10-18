import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PageRestrictedAreaPage } from './page-restricted-area.page';

import { canActivate } from '@angular/fire/compat/auth-guard';
import { pipe } from 'rxjs';
import { map } from 'rxjs/operators';
import { customClaims } from '@angular/fire/compat/auth-guard';

const adminOnly = () =>
  pipe(
    customClaims,
    map((claims) => claims.role === 1000)
  );

const routes: Routes = [
  {
    path: '',
    component: PageRestrictedAreaPage,
  },
  {
    path: 'gerenciar-admins',
    title: 'Gerenciar admins',
    loadChildren: () =>
      import('./page-manage-admins/page-manage-admins.module').then((m) => m.PageManageAdminsPageModule),
    ...canActivate(adminOnly),
  },
  {
    path: 'gerenciar-grandes-eventos',
    title: 'Gerenciar grandes eventos',
    loadChildren: () =>
      import('./page-manage-major-events/page-manage-major-events.module').then(
        (m) => m.PageManageMajorEventsPageModule
      ),
    ...canActivate(adminOnly),
  },
  {
    path: 'gerenciar-eventos',
    title: 'Gerenciar eventos',
    loadChildren: () =>
      import('./page-manage-events/page-manage-events.module').then((m) => m.PageManageEventsPageModule),
  },
  {
    path: 'impersonate',
    title: 'Impersonate',
    loadChildren: () => import('./page-impersonate/page-impersonate.module').then((m) => m.PageImpersonatePageModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageRestrictedAreaPageRoutingModule {}
