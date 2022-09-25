import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PageVerifyPhonePage } from './page-verify-phone.page';

const routes: Routes = [
  {
    path: '',
    component: PageVerifyPhonePage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageVerifyPhonePageRoutingModule {}
