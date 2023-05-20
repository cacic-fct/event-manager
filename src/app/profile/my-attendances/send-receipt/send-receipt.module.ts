import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SendReceiptPageRoutingModule } from './send-receipt-routing.module';

import { SendReceiptPage } from './send-receipt.page';
import { SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, SendReceiptPageRoutingModule, SweetAlert2Module],
  declarations: [SendReceiptPage],
})
export class SendReceiptPageModule {}
