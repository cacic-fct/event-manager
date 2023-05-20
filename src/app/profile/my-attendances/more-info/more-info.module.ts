import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MoreInfoPageRoutingModule } from './more-info-routing.module';

import { MoreInfoPage } from './more-info.page';

import { EventListComponent } from './event-list/event-list.component';
import { MajorEventDisplayModule } from '../../../shared/modules/major-event-display/major-event-display.module';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, MoreInfoPageRoutingModule, MajorEventDisplayModule],
  declarations: [MoreInfoPage, EventListComponent],
})
export class MoreInfoPageModule {}
