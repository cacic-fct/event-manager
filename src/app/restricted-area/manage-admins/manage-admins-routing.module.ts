import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ManageAdminsPage } from './manage-admins.page';

const routes: Routes = [
  {
    path: '',
    component: ManageAdminsPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ManageAdminsPageRoutingModule {}
