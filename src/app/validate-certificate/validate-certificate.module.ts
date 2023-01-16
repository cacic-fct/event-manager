import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ValidateCertificatePageRoutingModule } from './validate-certificate-routing.module';

import { ValidateCertificatePage } from './validate-certificate.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ValidateCertificatePageRoutingModule
  ],
  declarations: [ValidateCertificatePage]
})
export class ValidateCertificatePageModule {}
