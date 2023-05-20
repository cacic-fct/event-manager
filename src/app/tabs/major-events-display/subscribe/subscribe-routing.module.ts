import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SubscribePage } from './subscribe.page';

const routes: Routes = [
  {
    path: '',
    component: SubscribePage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SubscribePageRoutingModule {}
