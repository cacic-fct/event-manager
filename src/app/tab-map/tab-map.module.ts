import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TabMapPage } from './tab-map.page';

import { TabMapPageRoutingModule } from './tab-map-routing.module';

@NgModule({
  imports: [IonicModule, CommonModule, FormsModule, TabMapPageRoutingModule],
  declarations: [TabMapPage],
})
export class TabMapPageModule {}
