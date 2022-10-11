import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PageListSubscriptions } from './page-list-subscriptions';

const routes: Routes = [
  {
    path: '',
    component: PageListSubscriptions,
  },
  {
    path: 'gerenciar-inscricao/:subscriptionID',
    loadChildren: () =>
      import('./page-manage-subscription/page-manage-subscription.module').then(
        (m) => m.PageManageSubscriptionPageModule
      ),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageListSubscriptionsRoutingModule {}
