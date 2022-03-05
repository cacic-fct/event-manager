import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageCalendarEventPageRoutingModule } from './page-calendar-event-routing.module';

import { PageCalendarEventPage } from './page-calendar-event.page';

import { SafeModule } from '../shared/pipes/safe.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PageCalendarEventPageRoutingModule,
    SafeModule,
  ],
  declarations: [PageCalendarEventPage],
})
export class PageCalendarEventPageModule {}
