import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { DevelopmentToolsPageRoutingModule } from './development-tools-routing.module';

import { DevelopmentToolsPage } from './development-tools.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DevelopmentToolsPageRoutingModule
  ],
  declarations: [DevelopmentToolsPage]
})
export class DevelopmentToolsPageModule {}
