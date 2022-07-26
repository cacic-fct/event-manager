import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageSupportPageRoutingModule } from './page-support-routing.module';

import { PageSupportPage } from './page-support.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PageSupportPageRoutingModule
  ],
  declarations: [PageSupportPage]
})
export class PageSupportPageModule {}
