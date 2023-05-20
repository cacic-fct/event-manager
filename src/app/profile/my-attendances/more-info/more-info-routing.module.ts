import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MoreInfoPage } from './more-info.page';

const routes: Routes = [
  {
    path: '',
    component: MoreInfoPage,
  },
  {
    path: 'evento/:eventID',
    title: 'Informações do evento',
    loadChildren: () =>
      import('src/app/tabs/calendar/event-info-display/event-info-display.module').then(
        (m) => m.EventInfoDisplayPageModule
      ),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MoreInfoPageRoutingModule {}
