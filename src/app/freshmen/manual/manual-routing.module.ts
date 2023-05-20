import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ManualPage } from './manual.page';

const routes: Routes = [
  {
    path: '',
    component: ManualPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ManualPageRoutingModule {}
