import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageContactCasPageRoutingModule } from './page-contact-cas-routing.module';

import { PageContactCasPage } from './page-contact-cas.page';
import { ContactCasComponent } from './components/contact-cas/contact-cas.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PageContactCasPageRoutingModule,
  ],
  declarations: [PageContactCasPage, ContactCasComponent],
})
export class PageContactCasPageModule {}
