import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabMapPage } from './tab-map.page';

const routes: Routes = [
  {
    path: '',
    component: TabMapPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TabMapPageRoutingModule {}
