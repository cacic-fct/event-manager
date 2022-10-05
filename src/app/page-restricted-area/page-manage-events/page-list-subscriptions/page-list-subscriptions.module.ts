import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageListSubscriptionsRoutingModule } from './page-list-subscriptions-routing.module';
import { PageListSubscriptions } from './page-list-subscriptions';
import { IonicModule } from '@ionic/angular';
import { SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';

@NgModule({
  declarations: [PageListSubscriptions],
  imports: [CommonModule, IonicModule, SweetAlert2Module, PageListSubscriptionsRoutingModule],
})
export class PageListSubscriptionsModule {}
