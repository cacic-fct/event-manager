import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PageManageEvents } from './manage-events.page';

const routes: Routes = [
  {
    path: '',
    component: PageManageEvents,
  },
  {
    path: 'listar-inscritos/:eventID',
    title: 'Listar inscritos',
    loadChildren: () =>
      import('src/app/restricted-area/manage-events/list-subscriptions/list-subscriptions.module').then(
        (m) => m.ListSubscriptionsPageModule
      ),
  },
  {
    path: 'listar-presencas/:eventID',
    title: 'Listar presenças',
    loadChildren: () =>
      import('src/app/restricted-area/manage-events/list-attendances/list.module').then((m) => m.ListPageModule),
  },
  {
    path: 'coletar-presencas/:eventID',
    title: 'Coletar presenças',
    loadChildren: () =>
      import('src/app/restricted-area/manage-events/attendance-scanner/scanner.module').then(
        (m) => m.ScannerPageModule
      ),
  },
  {
    path: 'adicionar',
    title: 'Adicionar evento',
    loadChildren: () => import('./add-event/add-event.module').then((m) => m.AddEventPageModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageManageEventsRoutingModule {}
