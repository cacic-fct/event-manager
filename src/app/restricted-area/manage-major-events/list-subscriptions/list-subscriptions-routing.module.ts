import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ListSubscriptionsPage } from './list-subscriptions';

const routes: Routes = [
  {
    path: '',
    component: ListSubscriptionsPage,
  },
  {
    path: 'gerenciar-inscricao/:subscriptionID',
    loadChildren: () =>
      import(
        'src/app/restricted-area/manage-major-events/list-subscriptions/manage-subscription/manage-subscription.module'
      ).then((m) => m.ManageSubscriptionPageModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ListSubscriptionsPageRoutingModule {}
