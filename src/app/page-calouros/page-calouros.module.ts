import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PageCalourosPageRoutingModule } from './page-calouros-routing.module';

import { PageCalourosPage } from './page-calouros.page';

import { MarkdownModule } from 'ngx-markdown';

import { StepsAccordionComponent } from './components/steps-accordion/steps-accordion.component';
import { FaqAccordionComponent } from './components/faq-accordion/faq-accordion.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PageCalourosPageRoutingModule,
    MarkdownModule.forChild(),
  ],
  declarations: [
    PageCalourosPage,
    StepsAccordionComponent,
    FaqAccordionComponent,
  ],
})
export class PageCalourosPageModule {}
