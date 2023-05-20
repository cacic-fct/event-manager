import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { EventInfoDisplayPage } from './event-info-display.page';

const routes: Routes = [
  {
    path: '',
    component: EventInfoDisplayPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class EventInfoDisplayPageRoutingModule {}
