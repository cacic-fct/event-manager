import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabCalendarPage } from './tab-calendar.page';

const routes: Routes = [
  {
    path: '',
    component: TabCalendarPage,
  },
  {
    path: 'evento/:eventID',
    title: 'Informações do evento',
    loadChildren: () =>
      import('./page-calendar-event/page-calendar-event.module').then((m) => m.PageCalendarEventPageModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TabCalendarPageRoutingModule {}
