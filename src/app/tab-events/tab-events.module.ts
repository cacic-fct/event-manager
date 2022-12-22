import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TabEventsPage } from './tab-events.page';

import { MajorEventDisplayModule } from './../shared/modules/major-event-display/major-event-display.module';
import { TabEventsPageRoutingModule } from './tab-events-routing.module';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    RouterModule.forChild([{ path: '', component: TabEventsPage }]),
    TabEventsPageRoutingModule,
    MajorEventDisplayModule,
  ],
  declarations: [TabEventsPage],
})
export class TabEventsPageModule {}
