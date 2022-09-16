import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageManageMajorEventsPageRoutingModule } from './page-manage-major-events-routing.module';

import { PageManageMajorEventsPage } from './page-manage-major-events.page';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, PageManageMajorEventsPageRoutingModule],
  declarations: [PageManageMajorEventsPage],
})
export class PageManageMajorEventsPageModule {}
