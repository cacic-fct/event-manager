import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PageCalendarEventPage } from './page-calendar-event.page';

const routes: Routes = [
  {
    path: '',
    component: PageCalendarEventPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageCalendarEventPageRoutingModule {}
