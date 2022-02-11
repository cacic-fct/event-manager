import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TabCalendarPage } from './tab-calendar.page';

import { TabCalendarPageRoutingModule } from './tab-calendar-routing.module';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    TabCalendarPageRoutingModule,
  ],
  declarations: [TabCalendarPage],
})
export class TabCalendarPageModule {}
