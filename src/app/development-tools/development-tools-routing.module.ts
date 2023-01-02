import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { DevelopmentToolsPage } from './development-tools.page';

const routes: Routes = [
  {
    path: '',
    component: DevelopmentToolsPage,
  },
  {
    path: 'populate-db',
    loadChildren: () =>
      import('./populate-database/populate-database.module').then((m) => m.PopulateDatabasePageModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DevelopmentToolsPageRoutingModule {}
