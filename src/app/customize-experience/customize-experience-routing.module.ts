import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CustomizeExperiencePage } from './customize-experience.page';

const routes: Routes = [
  {
    path: '',
    component: CustomizeExperiencePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CustomizeExperiencePageRoutingModule {}
