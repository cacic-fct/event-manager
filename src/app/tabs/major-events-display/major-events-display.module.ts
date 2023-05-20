import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MajorEventsDisplayPage } from './major-events-display.page';

import { MajorEventDisplayModule } from '../../shared/modules/major-event-display/major-event-display.module';
import { MajorEventsDisplayPageRoutingModule } from './major-events-display-routing.module';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    RouterModule.forChild([{ path: '', component: MajorEventsDisplayPage }]),
    MajorEventsDisplayPageRoutingModule,
    MajorEventDisplayModule,
  ],
  declarations: [MajorEventsDisplayPage],
})
export class MajorEventsDisplayPageModule {}
