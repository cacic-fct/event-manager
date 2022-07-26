import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PageAboutPage } from './page-about.page';

const routes: Routes = [
  {
    path: '',
    component: PageAboutPage,
  },
  {
    path: 'suporte',
    loadChildren: () => import('./page-support/page-support.module').then((m) => m.PageSupportPageModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PageAboutPageRoutingModule {}
