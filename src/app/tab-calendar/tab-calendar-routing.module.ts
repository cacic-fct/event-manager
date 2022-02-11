import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabCalendarPage } from './tab-calendar.page';

const routes: Routes = [
  {
    path: '',
    component: TabCalendarPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TabCalendarPageRoutingModule {}
