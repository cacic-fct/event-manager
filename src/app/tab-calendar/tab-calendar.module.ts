import { CalendarListViewComponent } from './components/calendar-list-view/calendar-list-view.component';
import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TabCalendarPage } from './tab-calendar.page';

import { TabCalendarPageRoutingModule } from './tab-calendar-routing.module';
import { ItemListComponent } from './components/item-list/item-list.component';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    TabCalendarPageRoutingModule,
  ],
  declarations: [TabCalendarPage, ItemListComponent, CalendarListViewComponent],
})
export class TabCalendarPageModule {}
