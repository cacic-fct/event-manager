import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageConfirmAttendanceRoutingModule } from './page-confirm-attendance-routing.module';
import { PageConfirmAttendance } from './page-confirm-attendance';
import { IonicModule } from '@ionic/angular';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';

@NgModule({
  declarations: [PageConfirmAttendance],
  imports: [
    CommonModule,
    IonicModule,
    PageConfirmAttendanceRoutingModule,
    ReactiveFormsModule,
    FormsModule,
    SweetAlert2Module,
  ],
})
export class PageConfirmAttendanceModule {}
