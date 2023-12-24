import { Routes, RouterModule } from '@angular/router';

import { MyAttendancesPage } from './my-attendances.page';

export const routes: Routes = [
  {
    path: '',
    component: MyAttendancesPage,
  },
  {
    path: 'pagar/:eventID',
    title: 'Pagar evento',
    loadChildren: () => import('./send-receipt/send-receipt.routes').then((m) => m.routes),
  },
  {
    path: 'detalhes/:majorEventID',
    title: 'Detalhes da inscrição',
    loadChildren: () => import('./more-info/more-info.routes').then((m) => m.routes),
  },
];
