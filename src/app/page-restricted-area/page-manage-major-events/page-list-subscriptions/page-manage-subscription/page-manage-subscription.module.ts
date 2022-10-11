import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageManageSubscriptionPageRoutingModule } from './page-manage-subscription-routing.module';

import { PageManageSubscriptionPage } from './page-manage-subscription.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PageManageSubscriptionPageRoutingModule
  ],
  declarations: [PageManageSubscriptionPage]
})
export class PageManageSubscriptionPageModule {}
