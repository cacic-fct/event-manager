import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ManageSubscriptionPage } from './manage-subscription.page';

const routes: Routes = [
  {
    path: '',
    component: ManageSubscriptionPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ManageSubscriptionPageRoutingModule {}
