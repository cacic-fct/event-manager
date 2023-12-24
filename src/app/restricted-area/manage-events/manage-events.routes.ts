import { RouterModule, Routes } from '@angular/router';
import { PageManageEvents } from './manage-events.page';

export const routes: Routes = [
  {
    path: '',
    component: PageManageEvents,
  },
  {
    path: 'listar-inscritos/:eventID',
    title: 'Listar inscritos',
    loadChildren: () =>
      import('src/app/restricted-area/manage-events/list-subscriptions/list-subscriptions.routes').then(
        (m) => m.routes
      ),
  },
  {
    path: 'listar-presencas/:eventID',
    title: 'Listar presenças',
    loadChildren: () =>
      import('src/app/restricted-area/manage-events/list-attendances/list.routes').then((m) => m.routes),
  },
  {
    path: 'coletar-presencas/:eventID',
    title: 'Coletar presenças',
    loadChildren: () =>
      import('src/app/restricted-area/manage-events/attendance-scanner/scanner.routes').then((m) => m.routes),
  },
  {
    path: 'adicionar',
    title: 'Adicionar evento',
    loadChildren: () => import('./add-event/add-event.routes').then((m) => m.routes),
  },
];
