import { CertificatePreviewModalComponent } from './components/certificate-preview-modal/certificate-preview-modal.component';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { IssueCertificatePageRoutingModule } from './issue-certificate-routing.module';

import { IssueCertificatePage } from './issue-certificate.page';
import { SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';

@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    IonicModule,
    IssueCertificatePageRoutingModule,
    SweetAlert2Module,
  ],
  declarations: [IssueCertificatePage, CertificatePreviewModalComponent],
})
export class IssueCertificatePageModule {}
