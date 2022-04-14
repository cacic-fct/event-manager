import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageManageAdminsPageRoutingModule } from './page-manage-admins-routing.module';

import { PageManageAdminsPage } from './page-manage-admins.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    PageManageAdminsPageRoutingModule,
  ],
  declarations: [PageManageAdminsPage],
})
export class PageManageAdminsPageModule {}
