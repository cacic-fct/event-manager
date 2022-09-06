import { Component, OnInit } from '@angular/core';
import { AlertController } from '@ionic/angular';

@Component({
  selector: 'app-page-support',
  templateUrl: './page-support.page.html',
  styleUrls: ['./page-support.page.scss'],
})
export class PageSupportPage implements OnInit {
  serviceWorkerActive: boolean = false;

  constructor(private alertController: AlertController) {
    // If browser supports service worker
    if ('serviceWorker' in navigator) {
      // If service worker is "activated" or "activating"
      if (navigator.serviceWorker.controller) {
        this.serviceWorkerActive = true;
      }
    }
  }

  ngOnInit() {}

  async alertUpdate() {
    const alert = await this.alertController.create({
      header: 'Atualizar o aplicativo',
      message: 'Tem certeza que deseja continuar?',
      buttons: [
        {
          text: 'Sim',
          role: 'confirm',
          handler: () => {
            this.updateServiceWorker();
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
            this.unregisterServiceWorker();
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

  updateServiceWorker() {
    if (this.serviceWorkerActive) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const registration of registrations) {
            registration.update();
          }
        })
        .catch((err) => {
          console.error(err);
        });
    }
  }

  unregisterServiceWorker() {
    if (this.serviceWorkerActive) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
          }
        })
        .catch((err) => {
          console.error(err);
        });
    }
  }
}
