import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageDebugPageRoutingModule } from './page-debug-routing.module';

import { PageDebugPage } from './page-debug.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PageDebugPageRoutingModule
  ],
  declarations: [PageDebugPage]
})
export class PageDebugPageModule {}
