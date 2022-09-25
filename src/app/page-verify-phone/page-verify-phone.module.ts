import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageVerifyPhonePageRoutingModule } from './page-verify-phone-routing.module';

import { PageVerifyPhonePage } from './page-verify-phone.page';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, PageVerifyPhonePageRoutingModule],
  declarations: [PageVerifyPhonePage],
})
export class PageVerifyPhonePageModule {}
