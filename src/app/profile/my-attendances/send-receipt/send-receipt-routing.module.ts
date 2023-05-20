import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SendReceiptPage } from './send-receipt.page';

const routes: Routes = [
  {
    path: '',
    component: SendReceiptPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SendReceiptPageRoutingModule {}
