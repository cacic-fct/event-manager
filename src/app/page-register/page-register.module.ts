import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageRegisterPageRoutingModule } from './page-register-routing.module';

import { PageRegisterPage } from './page-register.page';

import { SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';

import { PageVerifyPhonePageModule } from '../page-verify-phone/page-verify-phone.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    PageRegisterPageRoutingModule,
    SweetAlert2Module,
    PageVerifyPhonePageModule,
  ],
  declarations: [PageRegisterPage],
})
export class PageRegisterPageModule {}
