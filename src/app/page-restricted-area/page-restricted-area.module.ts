import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageRestrictedAreaPageRoutingModule } from './page-restricted-area-routing.module';

import { PageRestrictedAreaPage } from './page-restricted-area.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PageRestrictedAreaPageRoutingModule
  ],
  declarations: [PageRestrictedAreaPage]
})
export class PageRestrictedAreaPageModule {}
