import { ApplicationRef, Injectable } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { AlertController } from '@ionic/angular';
import { first } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ServiceWorkerService {
  constructor(private appRef: ApplicationRef, private swUpdate: SwUpdate, private alertController: AlertController) {
    const appIsStable$ = this.appRef.isStable.pipe(first((isStable) => isStable === true));

    appIsStable$.subscribe(async () => {
      try {
        this.swUpdate.versionUpdates.subscribe((evt) => {
          switch (evt.type) {
            case 'VERSION_DETECTED':
              console.info(`Downloading new app version: ${evt.version.hash}`);
              break;
            case 'VERSION_READY':
              console.info(`Current app version: ${evt.currentVersion.hash}`);
              console.info(`New app version ready for use: ${evt.latestVersion.hash}`);
              this.newVersionAlert();
              break;
            case 'VERSION_INSTALLATION_FAILED':
              console.error(`Failed to install app version '${evt.version.hash}': ${evt.error}`);
              break;
          }
        });

        this.swUpdate.unrecoverable.subscribe(() => {
          this.tooOldAlert();
        });
      } catch (err) {
        console.error('Failed to check for updates:', err);
      }
    });
  }

  async newVersionAlert() {
    const alert = await this.alertController.create({
      header: 'Nova versão disponível',
      message: 'Atualize o aplicativo para receber melhorias e correções',
      buttons: [
        {
          text: 'Mais tarde',
          role: 'cancel',
        },
        {
          text: 'OK',
          role: 'confirm',
          handler: () => {
            document.location.reload();
          },
        },
      ],
      backdropDismiss: false,
      keyboardClose: true,
    });

    await alert.present();
  }

  async tooOldAlert() {
    const alert = await this.alertController.create({
      header: 'A versão do seu aplicativo é muito antiga',
      message: 'Uma atualização é necessária para continuar utilizando-o.',
      buttons: [
        {
          text: 'OK',
          role: 'confirm',
          handler: () => {
            document.location.reload();
          },
        },
      ],
      backdropDismiss: false,
      keyboardClose: true,
    });

    await alert.present();
  }
}
