import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageImpersonatePageRoutingModule } from './page-impersonate-routing.module';

import { PageImpersonatePage } from './page-impersonate.page';

@NgModule({
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, PageImpersonatePageRoutingModule],
  declarations: [PageImpersonatePage],
})
export class PageImpersonatePageModule {}
