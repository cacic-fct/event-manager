import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PageManageEvents } from './page-manage-events.page';

const routes: Routes = [
  {
    path: '',
    component: PageManageEvents,
  },
  {
    path: 'listar-inscritos/:eventID',
    title: 'Listar inscritos',
    loadChildren: () =>
      import('./page-list-subscriptions/page-list-subscriptions.module').then((m) => m.PageListSubscriptionsModule),
  },
  {
    path: 'listar-presencas/:eventID',
    title: 'Listar presenças',
    loadChildren: () => import('./page-list-attendance/list.module').then((m) => m.ListPageModule),
  },
  {
    path: 'coletar-presencas/:eventID',
    title: 'Coletar presenças',
    loadChildren: () => import('./page-scanner-attendance/scanner.module').then((m) => m.ScannerPageModule),
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
