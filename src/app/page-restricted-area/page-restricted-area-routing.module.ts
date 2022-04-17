import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PageRestrictedAreaPage } from './page-restricted-area.page';

const routes: Routes = [
  {
    path: '',
    component: PageRestrictedAreaPage,
  },
  {
    path: 'coletar-presenca',
    loadChildren: () =>
      import('./attendance/page-attendance/page-attendance.module').then((m) => m.PageAttendanceCollectPageModule),
  },
  {
    path: 'gerenciar-admins',
    loadChildren: () =>
      import('./page-manage-admins/page-manage-admins.module').then((m) => m.PageManageAdminsPageModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageRestrictedAreaPageRoutingModule {}
