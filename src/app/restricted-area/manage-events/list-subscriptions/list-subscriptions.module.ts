import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ListSubscriptionsPageRoutingModule } from './list-subscriptions-routing.module';
import { ListSubscriptionsPage } from './list-subscriptions';
import { IonicModule } from '@ionic/angular';
import { SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';

@NgModule({
  declarations: [ListSubscriptionsPage],
  imports: [CommonModule, IonicModule, SweetAlert2Module, ListSubscriptionsPageRoutingModule],
})
export class ListSubscriptionsPageModule {}
