// @ts-strict-ignore
import { NavController, ToastController } from '@ionic/angular/standalone';
import { Component, inject, ViewChild } from '@angular/core';
import { AngularFirestore, AngularFirestoreDocument } from '@angular/fire/compat/firestore';
import { trace } from '@angular/fire/compat/performance';
import { AbstractControl, FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { map, Observable, take, combineLatest } from 'rxjs';
import { EventItem } from '../../shared/services/event';
import { SwalComponent, SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';
import { MajorEventItem } from '../../shared/services/major-event.service';

import { serverTimestamp, arrayRemove } from '@angular/fire/firestore';
import { Auth, user } from '@angular/fire/auth';
import { AsyncPipe } from '@angular/common';

import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonItem,
  IonLabel,
  IonInput,
  IonProgressBar,
  IonText,
} from '@ionic/angular/standalone';

interface EventInfo {
  name: string;
}

@UntilDestroy()
@Component({
  selector: 'app-confirm-attendance',
  templateUrl: './confirm-attendance.html',
  styleUrls: ['./confirm-attendance.scss'],
  standalone: true,
  imports: [
    AsyncPipe,
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonItem,
    IonLabel,
    IonInput,
    IonProgressBar,
    IonText,
    SweetAlert2Module,
  ],
})
export class ConfirmAttendancePage {
  eventID: string;
  dataForm: FormGroup;
  eventInfo$: Observable<EventInfo>;
  private eventRef: AngularFirestoreDocument<EventItem>;
  private isSubEvent: boolean | undefined;
  private majorEventRef: AngularFirestoreDocument<MajorEventItem> | undefined;
  private isPaid: boolean | undefined;
  private attendanceCode: string | undefined;
  private belongsToMajorEvent: boolean | undefined;
  @ViewChild('swalConfirm') private swalConfirm!: SwalComponent;
  @ViewChild('swalNotFound') private swalNotFound!: SwalComponent;
  @ViewChild('swalNotOnTime') private swalNotOnTime!: SwalComponent;
  @ViewChild('swalAlreadyConfirmed') private swalAlreadyConfirmed!: SwalComponent;

  private auth: Auth = inject(Auth);
  user$ = user(this.auth);

  constructor(
    public formBuilder: FormBuilder,
    private route: ActivatedRoute,
    private afs: AngularFirestore,
    private navController: NavController,
    private router: Router,
    private toastController: ToastController,
  ) {
    this.eventID = this.route.snapshot.params['eventID'];
    this.dataForm = this.formBuilder.group({
      code: ['', [Validators.required, this.codeValidator]],
    });

    // Check if user is already registered
    this.user$.pipe(take(1), trace('auth')).subscribe((user) => {
      if (!user) {
        return;
      }

      const payingAttendance = this.afs
        .doc<EventItem>(`events/${this.eventID}/attendance/${user.uid}`)
        .get()
        .pipe(map((doc) => doc.exists));

      const nonPayingAttendance = this.afs
        .doc<EventItem>(`events/${this.eventID}/non-paying-attendance/${user.uid}`)
        .get()
        .pipe(map((doc) => doc.exists));

      const evaluateBool = combineLatest([payingAttendance, nonPayingAttendance]).pipe(
        map(([paying, nonPaying]) => paying || nonPaying),
      );

      evaluateBool.subscribe((isAttendanceAlreadyCollected) => {
        if (isAttendanceAlreadyCollected) {
          this.swalAlreadyConfirmed.fire();
          setTimeout(() => {
            this.swalAlreadyConfirmed.close();
            this.navController.back();
          }, 2000);
        }
      });
    });

    this.eventRef = this.afs.collection<EventItem>('events').doc(this.eventID);

    this.eventRef
      .valueChanges()
      .pipe(take(1), trace('firestore'))
      .subscribe((eventItem) => {
        if (!eventItem) {
          this.swalNotFound.fire();
          setTimeout(() => {
            this.router.navigate(['/menu']);
            this.swalNotFound.close();
          }, 2000);
          return;
        }

        if (!eventItem.attendanceCollectionStart || eventItem.attendanceCollectionEnd) {
          this.swalNotOnTime.fire();
          setTimeout(() => {
            this.router.navigate(['/menu']);
            this.swalNotOnTime.close();
          }, 2000);
        }
      });

    const eventValueChanges$: Observable<EventItem | undefined> = this.eventRef.valueChanges();
    // attendanceCode is constant
    eventValueChanges$.pipe(take(1)).subscribe((event) => {
      if (!event) {
        return;
      }

      this.attendanceCode = event.attendanceCode;
      if (event.inMajorEvent) {
        // If it is a subEvent, then check to see if the majorEvent
        // is paid or free.
        this.isSubEvent = true;
        // majorEvent reference
        this.majorEventRef = this.afs.collection<MajorEventItem>('majorEvents').doc(event.inMajorEvent);
        // Checking if majorEvent is paid
        // This should be constant
        this.majorEventRef
          .valueChanges()
          .pipe(take(1))
          .subscribe((majorEvent) => {
            if (!majorEvent) {
              return;
            }

            if (majorEvent.price.isFree) {
              this.isPaid = false;
            } else {
              this.isPaid = true;
            }
          });
      } else {
        this.isSubEvent = false;
        this.isPaid = false;
      }
    });

    // When the code is valid, automatically submit.
    this.dataForm
      ?.get('code')
      ?.valueChanges.pipe(untilDestroyed(this))
      .subscribe((value) => {
        if (value === this.attendanceCode) {
          this.onSubmit();
        }
      });

    this.eventInfo$ = eventValueChanges$.pipe(
      trace('firestore'),
      untilDestroyed(this),
      map((event) => ({
        name: event?.name || 'Evento indefinido',
      })),
    );
  }

  async errorToast() {
    const toast = await this.toastController.create({
      message: 'Ocorreu um erro. Tente novamente.',
      duration: 2000,
      buttons: [
        {
          text: 'OK',
          role: 'cancel',
        },
      ],
    });
    toast.present();
  }

  codeValidator = (formControl: AbstractControl): Record<string, boolean> | null => {
    if (!this.attendanceCode) {
      return { codeLoading: true };
    }
    if (formControl.value === this.attendanceCode) {
      return null;
    } else {
      return { wrongCode: true };
    }
  };

  onSubmit() {
    this.user$.pipe(take(1), trace('auth')).subscribe((user) => {
      if (!user) {
        return;
      }

      const userID = user.uid;

      if (this.isPaid === undefined || this.isSubEvent === undefined) {
        return;
      }

      const isPaymentNecessary: boolean = this.isSubEvent && this.isPaid;

      try {
        if (isPaymentNecessary) {
          if (!this.majorEventRef) {
            return;
          }
          // Check if user payment status = 2
          this.majorEventRef
            .collection('subscriptions')
            .doc(userID)
            .valueChanges()
            .pipe(take(1), trace('firestore'))
            .subscribe((subscriptionItem) => {
              if (!subscriptionItem) {
                return;
              }
              if (subscriptionItem['payment'].status === 2) {
                // Escrevendo na coleção 'attendance'
                this.eventRef.collection('attendance').doc(userID).set({
                  time: serverTimestamp(),
                  author: userID,
                  source: 'online',
                });
              } else {
                // Escrevendo na coleção 'non-paying-attendance'
                this.eventRef.collection('non-paying-attendance').doc(userID).set({
                  time: serverTimestamp(),
                  author: userID,
                  source: 'online',
                });
              }
            });
        } else {
          // Escrevendo na coleção 'attendance'
          this.eventRef.collection('attendance').doc(userID).set({
            time: serverTimestamp(),
            author: userID,
            source: 'online',
          });
        }

        this.afs
          .doc(`users/${userID}`)
          .update({
            'pending.onlineAttendance': arrayRemove(this.eventID),
          })
          .then(() => {
            setTimeout(() => {
              this.swalConfirm.fire();
              setTimeout(() => {
                this.swalConfirm.close();
                this.navController.back();
              }, 1500);
            }, 1500);
          });
      } catch (error) {
        this.dataForm?.get('code')?.enable();
        this.errorToast();
        console.error(error);
      }
    });
    return;
  }
}
