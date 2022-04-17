import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PageAttendancePage } from './page-attendance.page';

const routes: Routes = [
  {
    path: '',
    component: PageAttendancePage,
  },
  {
    path: 'scanner/:id',
    loadChildren: () => import('../page-scanner/scanner.module').then((m) => m.ScannerPageModule),
  },
  {
    path: 'list/:id',
    loadChildren: () => import('../page-list/list.module').then((m) => m.ListPageModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageAttendanceCollectPageRoutingModule {}
