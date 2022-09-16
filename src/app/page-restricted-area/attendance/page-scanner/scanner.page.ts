import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { BarcodeFormat } from '@zxing/library';
import { BehaviorSubject, first, isObservable, map, Observable } from 'rxjs';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { User } from 'src/app/shared/services/user';

import { CoursesService } from 'src/app/shared/services/courses.service';
import { fromUnixTime } from 'date-fns';
import { trace } from '@angular/fire/compat/performance';
import { EventItem } from 'src/app/shared/services/event';
import { SwalComponent } from '@sweetalert2/ngx-sweetalert2';

import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';

import { Timestamp } from '@firebase/firestore-types';
import { AuthService, GetUserUIDResponse } from 'src/app/shared/services/auth.service';

import { Attendance } from '../page-attendance/page-attendance.page';

@UntilDestroy()
@Component({
  selector: 'app-scanner',
  templateUrl: './scanner.page.html',
  styleUrls: ['./scanner.page.scss'],
})
export class ScannerPage implements OnInit {
  @Input('manualInput') manualInput: string;
  @ViewChild('mySwal')
  private mySwal: SwalComponent;

  // QR Code scanner
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

  attendanceCollection$: Observable<Attendance[]>;
  eventID: string;
  event$: Observable<EventItem>;

  _backdropVisibleSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  backdropVisible$: Observable<boolean> = this._backdropVisibleSubject.asObservable();

  attendanceSessionScans: number = 0;

  audioSuccess: HTMLAudioElement;

  constructor(
    private afs: AngularFirestore,
    private router: Router,
    private route: ActivatedRoute,
    public courses: CoursesService,
    private toastController: ToastController,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.eventID = this.route.snapshot.params.eventID;

    // If eventID is not valid, redirect
    this.afs
      .collection('events')
      .doc(this.eventID)
      .get()
      .pipe(untilDestroyed(this), trace('firestore'))
      .subscribe((document) => {
        if (!document.exists) {
          this.router.navigate(['area-restrita/coletar-presenca']);
          this.mySwal.fire();
          setTimeout(() => {
            this.mySwal.close();
          }, 1000);
        }
      });

    this.event$ = this.afs.collection('events').doc<EventItem>(this.eventID).valueChanges().pipe(trace('firestore'));

    // Get attendance list
    this.attendanceCollection$ = this.afs
      .collection<Attendance>(`events/${this.eventID}/attendance`, (ref) => {
        return ref.orderBy('time', 'desc');
      })
      .valueChanges({ idField: 'id' })
      .pipe(
        untilDestroyed(this),
        trace('firestore'),
        map((attendance) => {
          return attendance.map((item) => {
            return {
              ...item,
              user: this.afs.collection('users').doc<User>(item.id).valueChanges().pipe(trace('firestore'), first()),
            };
          });
        })
      );

    // Load audio asset (beep)
    this.audioSuccess = new Audio();
    this.audioSuccess.src = 'assets/sounds/scanner-beep.mp3';
    this.audioSuccess.load();
  }

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
    if (resultString.startsWith('uid:') && resultString.length === 32) {
      resultString = resultString.substring(4);
      console.log(resultString);
      this.afs
        .collection<Attendance>(`events/${this.eventID}/attendance`)
        .doc(resultString)
        .get()
        .pipe(first(), trace('firestore'))
        .subscribe((document) => {
          // If document with user uid already exists
          if (document.exists) {
            this.backdropColor('duplicate');
            this.toastDuplicate();
            return false;
          } else {
            // Check if user uid exists
            this.afs
              .collection('users')
              .doc(resultString)
              .get()
              .pipe(first(), trace('firestore'))
              .subscribe((user) => {
                if (user.exists) {
                  this.afs.collection(`events/${this.eventID}/attendance`).doc(resultString).set({
                    time: new Date(),
                  });
                  this.audioSuccess.play();
                  this.toastSucess();
                  this.backdropColor('success');
                  this.attendanceSessionScans++;
                  return true;
                } else {
                  this.backdropColor('invalid');
                  this.toastInvalid();
                  return false;
                }
              });
          }
        });
    } else {
      this.backdropColor('invalid');
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

  getDateFromTimestamp(timestamp: Timestamp): Date {
    return fromUnixTime(timestamp.seconds);
  }

  manualAttendance() {
    const response = this.authService.getUserUid(this.manualInput);

    this.manualInput = '';
    if (this.authService.instanceOfResponse(response) && response.status === false) {
      if (response.message) {
        this.backdropColor('invalid');
        this.toastRequestError(response.message);
      }
      return;
    }

    if (isObservable(response)) {
      response.pipe(first()).subscribe((response: GetUserUIDResponse) => {
        // If cloud function returns a message, it's an error
        if (response.message) {
          this.backdropColor('invalid');
          this.toastRequestError(response.message);
          console.error(response.message);
          return;
        } else {
          const uid = response.uid;
          this.afs
            .collection<Attendance>(`events/${this.eventID}/attendance`)
            .doc(uid)
            .get()
            .pipe(first(), trace('firestore'))
            .subscribe((document) => {
              // If document with user uid already exists in attendance list
              if (document.exists) {
                this.backdropColor('duplicate');
                this.toastDuplicate();
                return false;
              }
              // Check if user uid exists in user list
              this.afs
                .collection('users')
                .doc(uid)
                .get()
                .pipe(first(), trace('firestore'))
                .subscribe((user) => {
                  // If user uid exists, register attendance
                  if (user.exists) {
                    this.afs.collection(`events/${this.eventID}/attendance`).doc(uid).set({
                      time: new Date(),
                    });
                    this.audioSuccess.play();
                    this.toastSucess();
                    this.backdropColor('success');
                    this.attendanceSessionScans++;
                    return true;
                  } else {
                    this.backdropColor('invalid');
                    this.toastInvalid();
                    return false;
                  }
                });
            });
        }
      });
    }
  }

  async toastSucess() {
    const toast = await this.toastController.create({
      header: 'Escaneado com sucesso',
      icon: 'checkmark-circle',
      position: 'top',
      duration: 3000,
    });
    toast.present();
  }

  async toastDuplicate() {
    const toast = await this.toastController.create({
      header: 'Já escaneado',
      message:
        'Confira se o nome do usuário está na lista. Se não estiver, confira a sua conexão com a internet e recarregue a página.',
      icon: 'copy',
      position: 'top',
      duration: 5000,
      buttons: [
        {
          side: 'end',
          text: 'OK',
          role: 'cancel',
        },
      ],
    });
    toast.present();
  }

  async toastInvalid() {
    const toast = await this.toastController.create({
      header: 'QR Code incompatível ou perfil não encontrado no banco de dados',
      message: 'Solicite que o usuário faça logoff e login novamente ou insira os dados manualmente.',
      icon: 'close-circle',
      position: 'top',
      duration: 5000,
      buttons: [
        {
          side: 'end',
          text: 'OK',
          role: 'cancel',
        },
      ],
    });
    toast.present();
  }

  async toastRequestError(message: string) {
    const toast = await this.toastController.create({
      header: 'Ocorreu um erro ao processar a sua solicitação',
      message: message,
      icon: 'close-circle',
      position: 'top',
      duration: 5000,
      buttons: [
        {
          side: 'end',
          text: 'OK',
          role: 'cancel',
        },
      ],
    });
    toast.present();
  }

  async backdropColor(color: string) {
    // Add class to ion-backdrop
    document.querySelector('ion-backdrop').classList.add(color);

    // Change backdrop class to color
    this._backdropVisibleSubject.next(true);

    // Wait for 1 second
    await new Promise((resolve) => setTimeout(resolve, 1000));

    this._backdropVisibleSubject.next(false);
    // Remove backdrop class
    document.querySelector('ion-backdrop').classList.remove(color);
  }
}
