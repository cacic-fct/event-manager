import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ConfirmAttendancePage } from './confirm-attendance';

const routes: Routes = [
  {
    path: '',
    component: ConfirmAttendancePage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ConfirmAttendancePageRoutingModule {}
