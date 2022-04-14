import { Component, OnInit } from '@angular/core';
import { BarcodeFormat } from '@zxing/library';
import { BehaviorSubject, map, Observable, take } from 'rxjs';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { User } from 'src/app/shared/services/user';

import { CoursesService } from 'src/app/shared/services/courses.service';
import { fromUnixTime } from 'date-fns';
import { trace } from '@angular/fire/compat/performance';
import { EventItem } from 'src/app/shared/services/event';

@Component({
  selector: 'app-scanner',
  templateUrl: './scanner.page.html',
  styleUrls: ['./scanner.page.scss'],
})
export class ScannerPage implements OnInit {
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
  items$: attendance[];
  id: string;
  event: EventItem;

  attendanceSessionScans: number = 0;

  constructor(
    private afs: AngularFirestore,
    private router: Router,
    public courses: CoursesService,
    private toastController: ToastController
  ) {
    this.id = this.router.url.split('/')[4];

    this.afs
      .collection('events')
      .doc<EventItem>(this.id)
      .valueChanges()
      .subscribe((event) => {
        this.event = event;
      });

    this.afs
      .collection<any>(`events/${this.id}/attendance`, (ref) => {
        return ref.orderBy('time', 'desc');
      })
      .valueChanges({ idField: 'id' })
      .subscribe((items: any[]) => {
        this.items$ = items.map((item) => {
          return {
            ...item,
            user: this.afs
              .collection('users')
              .doc<User>(item.id)
              .valueChanges()
              .pipe(trace('firestore')),
          };
        });
      });
  }

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

  onCodeResult(resultString: string) {
    console.log(resultString);

    if (resultString.startsWith('uid:')) {
      resultString = resultString.substring(4);
      this.afs
        .collection<attendance>(`events/${this.id}/attendance`)
        .doc(resultString)
        .get()
        .subscribe((document) => {
          if (document.exists) {
            this.toastDuplicate();
            return false;
          } else {
            this.afs
              .collection(`events/${this.id}/attendance`)
              .doc(resultString)
              .set({
                uid: resultString,
                time: new Date(),
              });
            this.toastSucess();
            this.attendanceSessionScans++;
          }
        });
    } else {
      this.toastInvalid();
      return false;
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

  getDateFromTimestamp(timestamp: any): Date {
    return fromUnixTime(timestamp.seconds);
  }

  async toastSucess() {
    const toast = await this.toastController.create({
      header: 'Escaneado com sucesso',
      icon: 'checkmark-circle',
      position: 'top',
      duration: 3000,
    });
    await toast.present();
  }

  async toastDuplicate() {
    const toast = await this.toastController.create({
      header: 'Já escaneado',
      icon: 'copy',
      position: 'top',
      duration: 2000,
    });
    await toast.present();
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

interface attendance {
  user: Observable<User>;
  time: string | number | Date;
  uid: string;
}
