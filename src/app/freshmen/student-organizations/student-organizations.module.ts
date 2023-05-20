import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { StudentOrganizationsPageRoutingModule } from './student-organizations-routing.module';

import { StudentOrganizationsPage } from './student-organizations.page';
import { ContactCasComponent } from './components/contact-cas/contact-cas.component';
import { ContactEjsComponent } from './components/contact-ejs/contact-ejs.component';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, StudentOrganizationsPageRoutingModule],
  declarations: [StudentOrganizationsPage, ContactCasComponent, ContactEjsComponent],
})
export class StudentOrganizationsPageModule {}
