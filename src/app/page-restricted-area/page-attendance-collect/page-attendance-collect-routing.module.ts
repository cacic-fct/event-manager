import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PageAttendanceCollectPage } from './page-attendance-collect.page';

const routes: Routes = [
  {
    path: '',
    component: PageAttendanceCollectPage,
  },
  {
    path: 'scanner/:id',
    loadChildren: () =>
      import('./page-scanner/scanner.module').then((m) => m.ScannerPageModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageAttendanceCollectPageRoutingModule {}
