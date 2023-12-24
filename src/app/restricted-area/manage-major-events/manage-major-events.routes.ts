import { Routes, RouterModule } from '@angular/router';

import { ManageMajorEventsPage } from './manage-major-events.page';

export const routes: Routes = [
  {
    path: '',
    component: ManageMajorEventsPage,
  },
  {
    path: 'adicionar',
    loadChildren: () => import('./add-major-event/add-major-event.routes').then((m) => m.routes),
  },
  {
    path: 'validar-comprovante/:eventId',
    title: 'Validar comprovante',
    loadChildren: () => import('./validate-receipt/validate-receipt.routes').then((m) => m.routes),
  },
  {
    path: 'listar-inscritos/:eventID',
    title: 'Listar inscritos',
    loadChildren: () =>
      import('src/app/restricted-area/manage-major-events/list-subscriptions/list-subscriptions.routes').then(
        (m) => m.routes
      ),
  },
  {
    path: 'emitir-certificados/:eventID',
    loadChildren: () => import('./issue-certificate/issue-certificate.routes').then((m) => m.routes),
  },
  {
    path: 'emitir-certificados',
    redirectTo: '',
  },
];
