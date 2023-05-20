import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ManageMajorEventsPageRoutingModule } from './manage-major-events-routing.module';

import { ManageMajorEventsPage } from './manage-major-events.page';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, ManageMajorEventsPageRoutingModule],
  declarations: [ManageMajorEventsPage],
})
export class ManageMajorEventsPageModule {}
