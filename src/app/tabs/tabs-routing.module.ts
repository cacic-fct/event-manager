import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

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
    component: TabsPage,
    children: [
      {
        path: '',
        redirectTo: '/calendario',
        pathMatch: 'full',
      },
      {
        path: 'calendario',
        loadChildren: () => import('../tab-calendar/tab-calendar.module').then((m) => m.TabCalendarPageModule),
      },
      {
        path: 'mapa',
        loadChildren: () => import('../tab-map/tab-map.module').then((m) => m.TabMapPageModule),
      },
      {
        path: 'menu',
        loadChildren: () => import('../tab-menu/tab-menu.module').then((m) => m.TabMenuPageModule),
      },
      {
        path: 'area-restrita',
        loadChildren: () =>
          import('../page-restricted-area/page-restricted-area.module').then((m) => m.PageRestrictedAreaPageModule),
        ...canActivate(adminOnly),
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
})
export class TabsPageRoutingModule {}
