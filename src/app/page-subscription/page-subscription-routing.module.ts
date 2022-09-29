import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PageSubscriptionPage } from './page-subscription.page';

const routes: Routes = [
  {
    path: '',
    component: PageSubscriptionPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageSubscriptionPageRoutingModule {}
