import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PageContactEjsPage } from './page-contact-ejs.page';

const routes: Routes = [
  {
    path: '',
    component: PageContactEjsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageContactEjsPageRoutingModule {}
