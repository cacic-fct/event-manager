import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { WelcomePageRoutingModule } from './welcome-routing.module';

import { WelcomePage } from './welcome.page';

import { MarkdownModule } from 'ngx-markdown';

import { StepsAccordionComponent } from './components/steps-accordion/steps-accordion.component';
import { FaqAccordionComponent } from './components/faq-accordion/faq-accordion.component';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, WelcomePageRoutingModule, MarkdownModule.forChild()],
  declarations: [WelcomePage, StepsAccordionComponent, FaqAccordionComponent],
})
export class WelcomePageModule {}
