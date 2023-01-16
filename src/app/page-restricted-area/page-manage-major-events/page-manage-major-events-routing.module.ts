import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PageManageMajorEventsPage } from './page-manage-major-events.page';

const routes: Routes = [
  {
    path: '',
    component: PageManageMajorEventsPage,
  },
  {
    path: 'adicionar',
    loadChildren: () => import('./add-major-event/add-major-event.module').then((m) => m.AddMajorEventPageModule),
  },
  {
    path: 'validar-comprovante/:eventId',
    title: 'Validar comprovante',
    loadChildren: () => import('./validate-receipt/validate-receipt.module').then((m) => m.ValidateReceiptPageModule),
  },
  {
    path: 'listar-inscritos/:eventID',
    title: 'Listar inscritos',
    loadChildren: () =>
      import('./page-list-subscriptions/page-list-subscriptions.module').then((m) => m.PageListSubscriptionsModule),
  },
  {
    path: 'emitir-certificados/:eventID',
    loadChildren: () =>
      import('./issue-certificate/issue-certificate.module').then((m) => m.IssueCertificatePageModule),
  },
  {
    path: 'emitir-certificados',
    redirectTo: '',
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageManageMajorEventsPageRoutingModule {}
