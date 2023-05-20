import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { IssueCertificatePage } from './issue-certificate.page';

const routes: Routes = [
  {
    path: '',
    component: IssueCertificatePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class IssueCertificatePageRoutingModule {}
