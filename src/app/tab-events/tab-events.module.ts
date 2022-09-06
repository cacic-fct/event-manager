import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TabEventsPage } from './tab-events.page';

import { TabEventsPageRoutingModule } from './tab-events-routing.module';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    RouterModule.forChild([{ path: '', component: TabEventsPage }]),
    TabEventsPageRoutingModule,
  ],
  declarations: [TabEventsPage],
})
export class TabEventsPageModule {}
