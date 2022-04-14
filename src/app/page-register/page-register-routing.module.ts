import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PageRegisterPage } from './page-register.page';

const routes: Routes = [
  {
    path: '',
    component: PageRegisterPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageRegisterPageRoutingModule {}
