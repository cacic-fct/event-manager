import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageQrScannerPageRoutingModule } from './page-qr-scanner-routing.module';

import { PageQrScannerPage } from './page-qr-scanner.page';

import { ZXingScannerModule } from '@zxing/ngx-scanner';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PageQrScannerPageRoutingModule,
    ZXingScannerModule,
  ],
  declarations: [PageQrScannerPage],
})
export class PageQrScannerPageModule {}
