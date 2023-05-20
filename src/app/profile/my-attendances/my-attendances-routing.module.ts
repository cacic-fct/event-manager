import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MyAttendancesPage } from './my-attendances.page';

const routes: Routes = [
  {
    path: '',
    component: MyAttendancesPage,
  },
  {
    path: 'pagar/:eventID',
    title: 'Pagar evento',
    loadChildren: () => import('./send-receipt/send-receipt.module').then((m) => m.SendReceiptPageModule),
  },
  {
    path: 'detalhes/:majorEventID',
    title: 'Detalhes da inscrição',
    loadChildren: () => import('./more-info/more-info.module').then((m) => m.MoreInfoPageModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MyAttendancesPageRoutingModule {}
