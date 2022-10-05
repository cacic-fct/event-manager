import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ValidateReceiptPage } from './validate-receipt.page';

const routes: Routes = [
  {
    path: '',
    component: ValidateReceiptPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ValidateReceiptPageRoutingModule {}
