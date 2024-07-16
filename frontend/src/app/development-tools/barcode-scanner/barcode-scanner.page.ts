import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonIcon,
  IonButton,
  IonButtons,
  IonBackButton,
} from '@ionic/angular/standalone';
import { AztecScannerComponent } from 'src/app/shared/components/aztec-scanner/aztec-scanner.component';
import { ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cameraReverseOutline, qrCodeOutline } from 'ionicons/icons';
@Component({
  selector: 'app-barcode-scanner',
  templateUrl: './barcode-scanner.page.html',
  styleUrls: ['./barcode-scanner.page.scss'],
  standalone: true,
  imports: [
    IonBackButton,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    CommonModule,
    FormsModule,
    AztecScannerComponent,
  ],
})
export class BarcodeScannerPage {
  // QR Code scanner
  availableDevices!: MediaDeviceInfo[];
  currentDevice: MediaDeviceInfo | null = null;
  hasDevices = false;
  hasPermission = false;
  deviceIndex = -1;

  toastController = inject(ToastController);

  constructor() {
    addIcons({
      qrCodeOutline,
      cameraReverseOutline,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onCodeResult(event: any) {
    console.log(event);
    this.resultToast(event);
  }

  onDeviceList(event: MediaDeviceInfo[]) {
    this.availableDevices = event;
    this.hasDevices = Boolean(event && event.length);
  }

  onHasPermission(has: boolean) {
    this.hasPermission = has;
  }

  changeCamera(): void {
    this.deviceIndex++;
    if (this.deviceIndex === this.availableDevices.length) {
      this.deviceIndex = 0;
    }
    this.currentDevice = this.availableDevices[this.deviceIndex];
  }

  async resultToast(result: string) {
    const toast = await this.toastController.create({
      icon: 'qr-code-outline',
      header: 'Scan result',
      message: result,
      duration: 3000,
      position: 'bottom',
    });

    await toast.present();
  }
}
