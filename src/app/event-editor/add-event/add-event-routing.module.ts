import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AddEventPage } from './add-event.page';

const routes: Routes = [
  {
    path: '',
    component: AddEventPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AddEventPageRoutingModule {}
