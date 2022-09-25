import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PageDebugPage } from './page-debug.page';

const routes: Routes = [
  {
    path: '',
    component: PageDebugPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageDebugPageRoutingModule {}
