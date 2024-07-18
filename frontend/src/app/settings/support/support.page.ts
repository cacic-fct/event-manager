import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonCard,
  IonItem,
  IonIcon,
  IonLabel,
  IonAccordionGroup,
  IonAccordion,
  IonList,
  IonText,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { bugOutline, helpCircleOutline, mailOutline, sparklesOutline } from 'ionicons/icons';
import { ExplanationCardComponent } from 'src/app/settings/components/explanation-card/explanation-card.component';

import { Mailto, MailtoService } from 'src/app/shared/services/mailto.service';

@Component({
  selector: 'app-support',
  templateUrl: './support.page.html',
  styleUrls: ['./support.page.scss'],
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonCard,
    IonItem,
    IonIcon,
    IonLabel,
    IonAccordionGroup,
    IonAccordion,
    IonList,
    IonText,
    RouterLink,
    ExplanationCardComponent,
  ],
})
export class SupportPage {
  mailtoService = inject(MailtoService);
  constructor() {
    addIcons({
      bugOutline,
      sparklesOutline,
      mailOutline,
      helpCircleOutline,
    });
  }

  mailDevelopers(): void {
    const mailto: Mailto = {
      receiver: 'fctapp@cacic.dev.br',
      subject: '[FCT-App] Contato sobre o app',
    };
    this.mailtoService.open(mailto);
  }
}
