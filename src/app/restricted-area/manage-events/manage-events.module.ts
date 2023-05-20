import { GroupCreationModalComponent } from './components/group-creation-modal/group-creation-modal.component';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageManageEventsRoutingModule } from './manage-events-routing.module';
import { IonicModule } from '@ionic/angular';
import { PageManageEvents } from './manage-events.page';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

@NgModule({
  imports: [CommonModule, IonicModule, FormsModule, ReactiveFormsModule, PageManageEventsRoutingModule],
  declarations: [PageManageEvents, GroupCreationModalComponent],
})
export class ManageEventsPageModule {}
