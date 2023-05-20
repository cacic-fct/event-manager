// @ts-strict-ignore
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

import { canActivate } from '@angular/fire/compat/auth-guard';
import { caAndGreater } from '../shared/services/routing/guards.service';

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
        loadChildren: () => import('src/app/tabs/calendar/calendar.module').then((m) => m.CalendarPageModule),
      },
      {
        path: 'eventos',
        title: 'Lista de eventos',
        loadChildren: () =>
          import('src/app/tabs/major-events-display/major-events-display.module').then(
            (m) => m.MajorEventsDisplayPageModule
          ),
      },
      {
        path: 'mapa',
        title: 'Mapa',
        loadChildren: () => import('src/app/tabs/map/map.module').then((m) => m.MapPageModule),
      },
      {
        path: 'menu',
        title: 'Menu',
        loadChildren: () => import('src/app/tabs/menu/menu.module').then((m) => m.MenuPageModule),
      },
      {
        path: 'area-restrita',
        title: 'Área restrita',
        loadChildren: () =>
          import('src/app/restricted-area/restricted-area.module').then((m) => m.RestrictedAreaPageModule),
        ...canActivate(caAndGreater),
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
})
export class TabsPageRoutingModule {}
