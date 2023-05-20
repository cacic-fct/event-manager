import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { RestrictedAreaPageRoutingModule } from './restricted-area-routing.module';

import { RestrictedAreaPage } from './restricted-area.page';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RestrictedAreaPageRoutingModule],
  declarations: [RestrictedAreaPage],
})
export class RestrictedAreaPageModule {}
