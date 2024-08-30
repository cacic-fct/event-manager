import { Component, inject, isDevMode } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonCardContent,
  IonItem,
  IonIcon,
  IonLabel,
  IonCard,
  IonBackButton,
  IonButtons,
  IonText,
  IonCardTitle,
  IonCardHeader,
  ModalController,
} from '@ionic/angular/standalone';
import { ExplanationCardComponent } from 'src/app/settings/components/explanation-card/explanation-card.component';
import { ServiceWorkerService } from 'src/app/shared/services/service-worker/service-worker.service';

import { AlertController } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { ServiceWorkerStatusModalComponent } from 'src/app/settings/general/service-worker/service-worker-status-modal/service-worker-status-modal.component';

@Component({
  selector: 'app-service-worker',
  templateUrl: './service-worker.page.html',
  styleUrls: ['./service-worker.page.scss'],
  standalone: true,
  imports: [
    IonCardHeader,
    IonCardTitle,
    IonText,
    IonButtons,
    IonBackButton,
    IonCard,
    IonLabel,
    IonIcon,
    IonItem,
    IonCardContent,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    CommonModule,
    FormsModule,
    ExplanationCardComponent,
  ],
})
export class ServiceWorkerPage {
  isServiceWorkerActive = false;
  private modalController = inject(ModalController);
  private alertController = inject(AlertController);

  constructor(
    private sw: ServiceWorkerService,
    private router: Router,
  ) {
    this.isServiceWorkerActive = this.sw.getServiceWorkerStatus();
    if (!this.isServiceWorkerActive && !isDevMode()) {
      this.alertNotActive();
      this.router.navigate(['/ajustes/geral']);
    }
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

  async alertNotActive() {
    const alert = await this.alertController.create({
      header: 'O serviço de atualização não está ativo',
      message: 'Deseja ativar o serviço de atualização?',
      buttons: [
        {
          text: 'Ok',
        },
      ],
    });

    await alert.present();
  }

  async openStatusModal() {
    const modal = await this.modalController.create({
      component: ServiceWorkerStatusModalComponent,
    });
    modal.present();

    await modal.onWillDismiss();
  }
}
