// @ts-strict-ignore
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

import { canActivate } from '@angular/fire/compat/auth-guard';

import { pipe } from 'rxjs';
import { map } from 'rxjs/operators';
import { customClaims } from '@angular/fire/compat/auth-guard';

const caAndGreater = () =>
  pipe(
    customClaims,
    map((claims) => claims.role < 3000)
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
        title: 'Calendário de eventos',
        loadChildren: () => import('../tab-calendar/tab-calendar.module').then((m) => m.TabCalendarPageModule),
      },
      {
        path: 'eventos',
        title: 'Lista de eventos',
        loadChildren: () => import('../tab-events/tab-events.module').then((m) => m.TabEventsPageModule),
      },
      {
        path: 'mapa',
        title: 'Mapa',
        loadChildren: () => import('../tab-map/tab-map.module').then((m) => m.TabMapPageModule),
      },
      {
        path: 'menu',
        title: 'Menu',
        loadChildren: () => import('../tab-menu/tab-menu.module').then((m) => m.TabMenuPageModule),
      },
      {
        path: 'area-restrita',
        title: 'Área restrita',
        loadChildren: () =>
          import('../page-restricted-area/page-restricted-area.module').then((m) => m.PageRestrictedAreaPageModule),
        ...canActivate(caAndGreater),
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
})
export class TabsPageRoutingModule {}
