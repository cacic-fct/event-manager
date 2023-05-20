import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { VerifyPhonePageRoutingModule } from './verify-phone-routing.module';

import { VerifyPhonePage } from './verify-phone.page';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, VerifyPhonePageRoutingModule],
  declarations: [VerifyPhonePage],
})
export class VerifyPhonePageModule {}
