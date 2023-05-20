import { FilterModalPage } from './components/filter-modal/filter-modal.page';
import { CalendarListViewComponent } from './components/calendar-list-view/calendar-list-view.component';
import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CalendarPage } from './calendar.page';

import { CalendarPageRoutingModule } from './calendar-routing.module';
import { ItemListComponent } from './components/item-list/item-list.component';
import { ItemListViewComponent } from './components/item-list-view/item-list.component';

@NgModule({
  imports: [IonicModule, CommonModule, FormsModule, CalendarPageRoutingModule],
  declarations: [CalendarPage, ItemListComponent, CalendarListViewComponent, FilterModalPage, ItemListViewComponent],
})
export class CalendarPageModule {}
