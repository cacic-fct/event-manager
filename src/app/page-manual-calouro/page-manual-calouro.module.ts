import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageManualCalouroPageRoutingModule } from './page-manual-calouro-routing.module';

import { PageManualCalouroPage } from './page-manual-calouro.page';

import { MarkdownModule } from 'ngx-markdown';

import { ModuleManualModule } from './components/module-manual/module-manual.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PageManualCalouroPageRoutingModule,
    MarkdownModule.forChild(),
    ModuleManualModule,
  ],
  declarations: [PageManualCalouroPage],
})
export class PageManualCalouroPageModule {}
