import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { FilterModalPage } from './filter-modal.page';

const routes: Routes = [
  {
    path: '',
    component: FilterModalPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class FilterModalPageRoutingModule {}
