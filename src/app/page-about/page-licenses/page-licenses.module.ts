import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageLegalPageRoutingModule } from './page-licenses-routing.module';

import { PageLicensesPage } from './page-licenses.page';

import { MarkdownModule } from 'ngx-markdown';

import { DisplayLicensesComponent } from './display-licenses/display-licenses.component';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, PageLegalPageRoutingModule, MarkdownModule.forChild()],
  declarations: [PageLicensesPage, DisplayLicensesComponent],
})
export class PageLegalPageModule {}
