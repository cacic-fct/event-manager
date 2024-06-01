import { Routes } from '@angular/router';
import { ListMajorEventSubscriptionsPage } from './list-major-event-subscriptions';

export const routes: Routes = [
  {
    path: '',
    component: ListMajorEventSubscriptionsPage,
  },
  {
    path: 'gerenciar-inscricao/:subscriptionID',
    loadChildren: () =>
      import(
        'src/app/restricted-area/manage-major-events/list-major-event-subscriptions/manage-subscription/manage-subscription.routes'
      ).then((m) => m.routes),
  },
];
