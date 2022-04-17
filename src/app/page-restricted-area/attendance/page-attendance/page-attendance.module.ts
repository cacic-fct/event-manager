import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageAttendanceCollectPageRoutingModule } from './page-attendance-routing.module';

import { PageAttendancePage } from './page-attendance.page';
import { EventListComponent } from './components/event-list/event-list.component';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, PageAttendanceCollectPageRoutingModule],
  declarations: [PageAttendancePage, EventListComponent],
})
export class PageAttendanceCollectPageModule {}
