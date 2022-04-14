import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageAttendanceCollectPageRoutingModule } from './page-attendance-collect-routing.module';

import { PageAttendanceCollectPage } from './page-attendance-collect.page';
import { EventListComponent } from './components/event-list/event-list.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PageAttendanceCollectPageRoutingModule,
  ],
  declarations: [PageAttendanceCollectPage, EventListComponent],
})
export class PageAttendanceCollectPageModule {}
