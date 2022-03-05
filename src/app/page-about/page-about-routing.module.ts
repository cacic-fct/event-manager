import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PageAboutPage } from './page-about.page';

const routes: Routes = [
  {
    path: '',
    component: PageAboutPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageAboutPageRoutingModule {}
