import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PageMoreInfoPage } from './page-more-info.page';

const routes: Routes = [
  {
    path: '',
    component: PageMoreInfoPage,
  },
  {
    path: 'evento/:eventID',
    title: 'Informações do evento',
    loadChildren: () =>
      import('src/app/tab-calendar/page-calendar-event/page-calendar-event.module').then(
        (m) => m.PageCalendarEventPageModule
      ),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageMoreInfoPageRoutingModule {}
