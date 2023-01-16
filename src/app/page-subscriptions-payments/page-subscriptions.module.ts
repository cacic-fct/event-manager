import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageSubscriptionsPageRoutingModule } from './page-subscriptions-routing.module';

import { PageSubscriptionsPage } from './page-subscriptions.page';
import { ListCertificatesComponent } from './components/list-certificates/list-certificates.component';

import { EventCardComponent } from './components/event-card/event-card.component';
import { EventCardDisplayMainPageComponent } from './components/event-card-display-main-page/event-card-display-main-page.component';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, PageSubscriptionsPageRoutingModule],
  declarations: [
    PageSubscriptionsPage,
    EventCardComponent,
    EventCardDisplayMainPageComponent,
    ListCertificatesComponent,
  ],
})
export class PageSubscriptionsPageModule {}
