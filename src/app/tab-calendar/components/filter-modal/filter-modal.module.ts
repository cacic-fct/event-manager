import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { FilterModalPageRoutingModule } from './filter-modal-routing.module';

import { FilterModalPage } from './filter-modal.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    FilterModalPageRoutingModule,
  ],
  declarations: [FilterModalPage],
})
export class FilterModalPageModule {}
