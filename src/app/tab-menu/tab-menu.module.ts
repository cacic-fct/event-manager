import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TabMenuPage } from './tab-menu.page';

import { TabMenuPageRoutingModule } from './tab-menu-routing.module';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    RouterModule.forChild([{ path: '', component: TabMenuPage }]),
    TabMenuPageRoutingModule,
  ],
  declarations: [TabMenuPage],
})
export class TabMenuPageModule {}
