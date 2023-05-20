import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MajorEventsDisplayPage } from './major-events-display.page';

const routes: Routes = [
  {
    path: '',
    component: MajorEventsDisplayPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MajorEventsDisplayPageRoutingModule {}
