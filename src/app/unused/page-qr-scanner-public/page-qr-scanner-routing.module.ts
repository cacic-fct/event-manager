import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PageQrScannerPage } from './page-qr-scanner.page';

const routes: Routes = [
  {
    path: '',
    component: PageQrScannerPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageQrScannerPageRoutingModule {}
