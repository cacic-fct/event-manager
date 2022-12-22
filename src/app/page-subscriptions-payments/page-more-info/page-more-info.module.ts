import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageMoreInfoPageRoutingModule } from './page-more-info-routing.module';

import { PageMoreInfoPage } from './page-more-info.page';

import { EventListComponent } from './event-list/event-list.component';
import { MajorEventDisplayModule } from './../../shared/modules/major-event-display/major-event-display.module';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, PageMoreInfoPageRoutingModule, MajorEventDisplayModule],
  declarations: [PageMoreInfoPage, EventListComponent],
})
export class PageMoreInfoPageModule {}
