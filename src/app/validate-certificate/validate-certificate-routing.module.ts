import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ValidateCertificatePage } from './validate-certificate.page';

const routes: Routes = [
  {
    path: '',
    component: ValidateCertificatePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ValidateCertificatePageRoutingModule {}
