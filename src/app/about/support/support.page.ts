import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AlertController } from '@ionic/angular/standalone';

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

import { ServiceWorkerService } from 'src/app/shared/services/service-worker/service-worker.service';

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
  ],
})
export class SupportPage {
  serviceWorkerActive = false;

  constructor(
    private alertController: AlertController,
    private sw: ServiceWorkerService,
  ) {
    this.serviceWorkerActive = this.sw.getServiceWorkerStatus();
  }

  async alertUpdate() {
    const alert = await this.alertController.create({
      header: 'Atualizar o aplicativo',
      message: 'Tem certeza que deseja continuar?',
      buttons: [
        {
          text: 'Sim',
          role: 'confirm',
          handler: () => {
            this.sw.updateServiceWorker();
          },
        },
        {
          text: 'Não',
          role: 'cancel',
        },
      ],
    });

    await alert.present();
  }

  async alertUnregister() {
    const alert = await this.alertController.create({
      header: 'Deseja cancelar o registro?',
      message: 'Ao continuar, uma grande quantidade de dados será consumida',
      buttons: [
        {
          text: 'Sim',
          role: 'confirm',
          handler: () => {
            this.sw.unregisterServiceWorker();
          },
        },
        {
          text: 'Não',
          role: 'cancel',
        },
      ],
    });

    await alert.present();
  }
}
