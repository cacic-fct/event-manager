import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PageListSubscriptions } from './page-list-subscriptions';

const routes: Routes = [
  {
    path: '',
    component: PageListSubscriptions,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageListSubscriptionsRoutingModule {}
