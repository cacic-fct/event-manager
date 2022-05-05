import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageContactEjsPageRoutingModule } from './page-contact-ejs-routing.module';

import { PageContactEjsPage } from './page-contact-ejs.page';

import { ContactEjsComponent } from './components/contact-ejs/contact-ejs.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PageContactEjsPageRoutingModule,
  ],
  declarations: [PageContactEjsPage, ContactEjsComponent],
})
export class PageContactEjsPageModule {}
