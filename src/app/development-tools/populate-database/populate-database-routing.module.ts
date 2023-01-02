import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PopulateDatabasePage } from './populate-database.page';

const routes: Routes = [
  {
    path: '',
    component: PopulateDatabasePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PopulateDatabasePageRoutingModule {}
