import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PagePayPage } from './page-pay.page';

const routes: Routes = [
  {
    path: '',
    component: PagePayPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PagePayPageRoutingModule {}
