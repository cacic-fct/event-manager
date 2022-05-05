import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PageContactCasPage } from './page-contact-cas.page';

const routes: Routes = [
  {
    path: '',
    component: PageContactCasPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageContactCasPageRoutingModule {}
