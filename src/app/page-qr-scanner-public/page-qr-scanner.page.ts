import { Component, OnInit } from '@angular/core';
import { BarcodeFormat } from '@zxing/library';
import { BehaviorSubject } from 'rxjs';
import { ModalController } from '@ionic/angular';

import { IonRouterOutlet, AlertController } from '@ionic/angular';
import { ToastController } from '@ionic/angular';

@Component({
  selector: 'app-page-qr-scanner',
  templateUrl: './page-qr-scanner.page.html',
  styleUrls: ['./page-qr-scanner.page.scss'],
})
export class PageQrScannerPage implements OnInit {
  constructor(
    public modalController: ModalController,
    private routerOutlet: IonRouterOutlet,
    public toastController: ToastController
  ) {}
  availableDevices: MediaDeviceInfo[];
  currentDevice: MediaDeviceInfo = null;
  allowedFormats = [BarcodeFormat.QR_CODE];
  torchEnabled = false;
  torchAvailable = new BehaviorSubject<boolean>(false);
  hasDevices: boolean;
  hasPermission: boolean;
  qrResultString: string;
  deviceIndex: number = -1;
  showScanner = true;

  alertController: AlertController;
  /*
  async presentModal(userID: string) {
    const modal = await this.modalController.create({
      component: PageProfileCardPage,
      cssClass: 'my-custom-class',
      componentProps: {
        userID: userID,
      },
      swipeToClose: true,
      presentingElement: this.routerOutlet.nativeEl,
    });
    this.showScanner = false;

    modal.onDidDismiss().then(() => {
      this.showScanner = true;
    });

    return await modal.present();
  }
*/
  ngOnInit() {}

  changeCamera(): void {
    this.deviceIndex++;
    if (this.deviceIndex === this.availableDevices.length) {
      this.deviceIndex = 0;
    }
    this.currentDevice = this.availableDevices[this.deviceIndex];
  }

  onCamerasFound(devices: MediaDeviceInfo[]): void {
    this.availableDevices = devices;
    this.hasDevices = Boolean(devices && devices.length);
  }

  async presentToast() {
    const toast = await this.toastController.create({
      message: 'Código inválido.',
      duration: 2000,
    });
    toast.present();
  }

  onCodeResult(resultString: string) {
    if (resultString.startsWith('uid:')) {
      //this.presentModal(resultString.substring(4));
    } else {
      this.toastInvalid();
    }
  }

  onTorchCompatible(isCompatible: boolean): void {
    this.torchAvailable.next(isCompatible || false);
  }

  toggleTorch(): void {
    this.torchEnabled = !this.torchEnabled;
  }

  onHasPermission(has: boolean) {
    this.hasPermission = has;
  }

  async toastInvalid() {
    const toast = await this.toastController.create({
      header: 'QR Code incompatível',
      icon: 'close-circle',
      position: 'top',
      duration: 2000,
    });
    await toast.present();
  }
}
