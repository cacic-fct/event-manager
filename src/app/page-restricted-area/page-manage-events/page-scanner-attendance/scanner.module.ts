import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ScannerPageRoutingModule } from './scanner-routing.module';

import { ScannerPage } from './scanner.page';

import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, ScannerPageRoutingModule, ZXingScannerModule, SweetAlert2Module],
  declarations: [ScannerPage],
})
export class ScannerPageModule {}
