import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MapPage } from './map.page';

import { MapPageRoutingModule } from './map-routing.module';

@NgModule({
  imports: [IonicModule, CommonModule, FormsModule, MapPageRoutingModule],
  declarations: [MapPage],
})
export class MapPageModule {}
