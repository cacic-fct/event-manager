import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageCalendarEventPageRoutingModule } from './page-calendar-event-routing.module';

import { PageCalendarEventPage } from './page-calendar-event.page';

import { EventDisplayModule } from '../../shared/modules/event-display/event-display.module';

@NgModule({
  declarations: [PageCalendarEventPage],
  imports: [CommonModule, FormsModule, IonicModule, PageCalendarEventPageRoutingModule, EventDisplayModule],
})
export class PageCalendarEventPageModule {}
