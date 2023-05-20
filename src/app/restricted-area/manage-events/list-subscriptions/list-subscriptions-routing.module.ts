import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ListSubscriptionsPage } from './list-subscriptions';

const routes: Routes = [
  {
    path: '',
    component: ListSubscriptionsPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ListSubscriptionsPageRoutingModule {}
