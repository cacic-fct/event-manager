import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { VerifyPhonePage } from './verify-phone.page';

const routes: Routes = [
  {
    path: '',
    component: VerifyPhonePage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class VerifyPhonePageRoutingModule {}
