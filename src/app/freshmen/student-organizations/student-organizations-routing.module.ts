import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { StudentOrganizationsPage } from './student-organizations.page';

const routes: Routes = [
  {
    path: '',
    component: StudentOrganizationsPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class StudentOrganizationsPageRoutingModule {}
