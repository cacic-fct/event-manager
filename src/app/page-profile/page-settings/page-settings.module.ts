import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageSettingsPageRoutingModule } from './page-settings-routing.module';

import { PageSettingsPage } from './page-settings.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PageSettingsPageRoutingModule
  ],
  declarations: [PageSettingsPage]
})
export class PageSettingsPageModule {}
