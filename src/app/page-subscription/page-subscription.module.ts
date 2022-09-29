import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PageSubscriptionPage } from './page-subscription.page';

import { PageSubscriptionPageRoutingModule } from './page-subscription-routing.module';
import { ConfirmModalComponent } from './confirm-modal/confirm-modal.component';
import { SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    PageSubscriptionPageRoutingModule,
    SweetAlert2Module,
  ],
  declarations: [PageSubscriptionPage, ConfirmModalComponent],
})
export class PageSubscriptionPageModule {}
