import { RouterModule, Routes } from '@angular/router';
import { ListSubscriptionsPage } from './list-subscriptions';

export const routes: Routes = [
  {
    path: '',
    component: ListSubscriptionsPage,
  },
  {
    path: 'gerenciar-inscricao/:subscriptionID',
    loadChildren: () =>
      import(
        'src/app/restricted-area/manage-major-events/list-subscriptions/manage-subscription/manage-subscription.routes'
      ).then((m) => m.routes),
  },
];
