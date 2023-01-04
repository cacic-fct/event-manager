import { GroupCreationModalComponent } from './components/group-creation-modal/group-creation-modal.component';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageManageEventsRoutingModule } from './page-manage-events-routing.module';
import { IonicModule } from '@ionic/angular';
import { PageManageEvents } from './page-manage-events.page';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

@NgModule({
  imports: [CommonModule, IonicModule, FormsModule, ReactiveFormsModule, PageManageEventsRoutingModule],
  declarations: [PageManageEvents, GroupCreationModalComponent],
})
export class PageManageEventsPageModule {}
