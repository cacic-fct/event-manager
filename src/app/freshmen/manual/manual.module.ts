import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ManualPageRoutingModule } from './manual-routing.module';

import { ManualPage } from './manual.page';

import { MarkdownModule } from 'ngx-markdown';

import { ModuleManualModule } from './components/module-manual/module-manual.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ManualPageRoutingModule,
    MarkdownModule.forChild(),
    ModuleManualModule,
  ],
  declarations: [ManualPage],
})
export class ManualPageModule {}
