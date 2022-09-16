import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PageManageMajorEventsPage } from './page-manage-major-events.page';

const routes: Routes = [
  {
    path: '',
    component: PageManageMajorEventsPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageManageMajorEventsPageRoutingModule {}
