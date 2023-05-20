import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ManageAdminsPageRoutingModule } from './manage-admins-routing.module';

import { ManageAdminsPage } from './manage-admins.page';

@NgModule({
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, ManageAdminsPageRoutingModule],
  declarations: [ManageAdminsPage],
})
export class ManageAdminsPageModule {}
