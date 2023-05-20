import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageLegalPageRoutingModule } from './licenses-routing.module';

import { LicensesPage } from './licenses.page';

import { MarkdownModule } from 'ngx-markdown';

import { DisplayLicensesComponent } from './display-licenses/display-licenses.component';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, PageLegalPageRoutingModule, MarkdownModule.forChild()],
  declarations: [LicensesPage, DisplayLicensesComponent],
})
export class PageLegalPageModule {}
