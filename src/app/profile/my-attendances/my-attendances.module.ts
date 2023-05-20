import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MyAttendancesPageRoutingModule } from './my-attendances-routing.module';

import { MyAttendancesPage } from './my-attendances.page';
import { ListCertificatesComponent } from './components/list-certificates/list-certificates.component';

import { EventCardComponent } from './components/event-card/event-card.component';
import { EventCardDisplayMainPageComponent } from './components/event-card-display-main-page/event-card-display-main-page.component';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, MyAttendancesPageRoutingModule],
  declarations: [MyAttendancesPage, EventCardComponent, EventCardDisplayMainPageComponent, ListCertificatesComponent],
})
export class MyAttendancesPageModule {}
