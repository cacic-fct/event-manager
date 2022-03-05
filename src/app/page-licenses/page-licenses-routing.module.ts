import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PageLicensesPage } from './page-licenses.page';

const routes: Routes = [
  {
    path: '',
    component: PageLicensesPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageLegalPageRoutingModule {}
