import { Component, OnInit } from '@angular/core';
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

import {
  getServiceWorkerStatus,
  updateServiceWorker,
  unregisterServiceWorker,
} from 'src/app/shared/services/service-worker/service-worker.service';

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
  ],
})
export class SupportPage implements OnInit {
  serviceWorkerActive: boolean = false;

  constructor(private alertController: AlertController) {}

  ngOnInit() {
    this.serviceWorkerActive = getServiceWorkerStatus();
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
            updateServiceWorker();
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
            unregisterServiceWorker();
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
