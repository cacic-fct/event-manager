import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PagePayPageRoutingModule } from './page-pay-routing.module';

import { PagePayPage } from './page-pay.page';
import { SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, PagePayPageRoutingModule, SweetAlert2Module],
  declarations: [PagePayPage],
})
export class PagePayPageModule {}
