import { UpdateModalComponent } from './update-modal/update-modal.component';
import { ApplicationRef, Injectable } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { first } from 'rxjs';

import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';

@UntilDestroy()
@Injectable({
  providedIn: 'root',
})
export class ServiceWorkerService {
  constructor(
    private appRef: ApplicationRef,
    private swUpdate: SwUpdate,
    private alertController: AlertController,
    private modalController: ModalController,
  ) {
    const appIsStable$ = this.appRef.isStable.pipe(first((isStable) => isStable === true));

    appIsStable$.pipe(untilDestroyed(this)).subscribe(async () => {
      try {
        this.swUpdate.versionUpdates.pipe(untilDestroyed(this)).subscribe((evt) => {
          switch (evt.type) {
            case 'VERSION_DETECTED':
              console.info(`Downloading new app version: ${evt.version.hash}`);
              this.openModal();
              break;
            case 'VERSION_READY':
              console.info(`Current app version: ${evt.currentVersion.hash}`);
              console.info(`New app version ready for use: ${evt.latestVersion.hash}`);
              document.location.reload();
              break;
            case 'VERSION_INSTALLATION_FAILED':
              console.error(`Failed to install app version '${evt.version.hash}': ${evt.error}`);
              this.updateErrorAlert(evt.error);
              break;
          }
        });

        this.swUpdate.unrecoverable.pipe(untilDestroyed(this)).subscribe(() => {
          this.tooOldAlert();
        });
      } catch (err) {
        console.error('Failed to check for updates:', err);
      }
    });
  }

  async openModal() {
    const modal = await this.modalController.create({
      component: UpdateModalComponent,
      canDismiss: false,
    });
    modal.present();
  }

  async updateErrorAlert(error: string) {
    const alert = await this.alertController.create({
      header: 'Erro ao atualizar o aplicativo',
      message: error,
      buttons: [
        {
          text: 'Cancelar registro',
          role: 'cancel',
          handler: () => {
            this.unregisterServiceWorker();
            document.location.reload();
          },
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

  /**
   * Checks the status of the service worker.
   *
   * @returns {boolean} Returns `true` if the service worker is "activated" or "activating", otherwise `false`.
   */
  getServiceWorkerStatus(): boolean {
    console.debug('DEBUG: Checking service worker status');
    // If browser supports service worker
    if ('serviceWorker' in navigator) {
      // If service worker is "activated" or "activating"
      if (navigator.serviceWorker.controller) {
        console.debug('DEBUG: Service worker is active');
        return true;
      }
    }
    console.debug('DEBUG: Service worker is not active');
    return false;
  }

  /**
   * Updates the service worker if it is active.
   */
  updateServiceWorker(): void {
    if (this.getServiceWorkerStatus()) {
      console.debug('DEBUG: Updating service worker');
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const registration of registrations) {
            console.debug('DEBUG: Updating service worker:', registration);
            registration.update();
          }
        })
        .catch((err) => {
          console.error(err);
        });
    }
  }

  /**
   * Unregisters the service worker if it is active.
   */
  unregisterServiceWorker(): void {
    console.debug('DEBUG: Unregistering service worker');
    if (this.getServiceWorkerStatus()) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const registration of registrations) {
            console.debug('DEBUG: Unregistering service worker:', registration);
            registration.unregister();
          }
        })
        .catch((err) => {
          console.error(err);
        });
    }
  }
}
