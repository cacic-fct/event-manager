import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PageManageSubscriptionPage } from './page-manage-subscription.page';

const routes: Routes = [
  {
    path: '',
    component: PageManageSubscriptionPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageManageSubscriptionPageRoutingModule {}
