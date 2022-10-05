import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ValidateReceiptPageRoutingModule } from './validate-receipt-routing.module';
import { ValidateReceiptPage } from './validate-receipt.page';
import { GetDownloadURLPipeModule } from '@angular/fire/compat/storage';
import { SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    ValidateReceiptPageRoutingModule,
    GetDownloadURLPipeModule,
    SweetAlert2Module,
  ],
  declarations: [ValidateReceiptPage],
})
export class ValidateReceiptPageModule {}
