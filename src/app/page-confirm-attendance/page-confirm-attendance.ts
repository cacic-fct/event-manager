import { NavController } from '@ionic/angular';
import { Component, OnInit, ViewChild } from '@angular/core';
import { AngularFirestore, AngularFirestoreDocument } from '@angular/fire/compat/firestore';
import { trace } from '@angular/fire/compat/performance';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { map, Observable, take } from 'rxjs';
import { EventItem } from '../shared/services/event';
import { Timestamp as TimestampType } from '@firebase/firestore-types';
import { fromUnixTime } from 'date-fns';
import { SwalComponent } from '@sweetalert2/ngx-sweetalert2';
import { MajorEventItem } from '../shared/services/major-event.service';
import { AngularFireAuth } from '@angular/fire/compat/auth';

import { serverTimestamp } from '@angular/fire/firestore';

interface EventInfo {
  name: string;
}

@UntilDestroy()
@Component({
  selector: 'app-page-confirm-attendance',
  templateUrl: './page-confirm-attendance.html',
  styleUrls: ['./page-confirm-attendance.scss'],
})
export class PageConfirmAttendance implements OnInit {
  eventID: string;
  dataForm: FormGroup;
  eventInfo$: Observable<EventInfo>;
  private eventRef: AngularFirestoreDocument<EventItem>;
  private isSubEvent: boolean;
  private majorEventRef: AngularFirestoreDocument<MajorEventItem>;
  private isPaid: boolean;
  private attendanceCode: string;
  @ViewChild('swalConfirm') private swalConfirm: SwalComponent;
  @ViewChild('swalNotFound') private swalNotFound: SwalComponent;
  @ViewChild('swalNotOnTime') private swalNotOnTime: SwalComponent;

  constructor(
    public formBuilder: FormBuilder,
    private route: ActivatedRoute,
    private afs: AngularFirestore,
    private navController: NavController,
    private router: Router,
    private auth: AngularFireAuth
  ) {}

  ngOnInit() {
    this.eventID = this.route.snapshot.params.eventID;
    this.dataForm = this.formBuilder.group({
      code: ['', [Validators.required, this.codeValidator]],
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
        }
        if (!eventItem.attendanceCollectionStart || eventItem.attendanceCollectionEnd) {
          this.swalNotOnTime.fire();
          setTimeout(() => {
            this.router.navigate(['/menu']);
            this.swalNotOnTime.close();
          }, 2000);
        }
      });

    const eventValueChanges$: Observable<EventItem> = this.eventRef.valueChanges();
    // attendanceCode is constant
    eventValueChanges$.pipe(take(1)).subscribe((event) => {
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
            if (majorEvent.price.isFree) {
              this.isPaid = false;
            } else {
              this.isPaid = true;
            }
          });
      } else {
        this.isSubEvent = false;
      }
    });

    // When the code is valid, automatically submit.
    this.dataForm.get('code').valueChanges.subscribe((value) => {
      if (value == this.attendanceCode) {
        this.onSubmit();
      }
    });

    this.eventInfo$ = eventValueChanges$.pipe(
      trace('firestore'),
      untilDestroyed(this),
      map((event) => ({
        name: event.name,
      }))
    );
  }

  codeValidator = (formControl: AbstractControl): { [key: string]: boolean } | null => {
    if (!this.attendanceCode) {
      return { codeLoading: true };
    }
    if (formControl.value == this.attendanceCode) {
      return null;
    } else {
      return { wrongCode: true };
    }
  };

  getDateFromTimestamp(timestamp: TimestampType): Date {
    return fromUnixTime(timestamp.seconds);
  }

  onSubmit() {
    this.auth.user.pipe(take(1), trace('auth')).subscribe((user) => {
      const userID = user.uid;

      const isPaymentNecessary: boolean = this.isSubEvent && this.isPaid;
      if (isPaymentNecessary) {
        // Check if user payment status = 2
        this.majorEventRef
          .collection('subscriptions')
          .doc(userID)
          .valueChanges()
          .pipe(take(1), trace('firestore'))
          .subscribe((subscriptionItem) => {
            if (subscriptionItem.payment.status == 2) {
              // Escrevendo na coleção 'attendance'
              this.eventRef.collection('attendance').doc(userID).set({
                // @ts-ignore
                time: serverTimestamp(),
              });
            } else {
              // Escrevendo na coleção 'non-paying-attendance'
              this.eventRef.collection('non-paying-attendance').doc(userID).set({
                // @ts-ignore
                time: serverTimestamp(),
              });
            }
          });
      } else {
        // Escrevendo na coleção 'attendance'
        this.eventRef.collection('attendance').doc(userID).set({
          // @ts-ignore
          time: serverTimestamp(),
        });
      }

      this.swalConfirm.fire();
      setTimeout(() => {
        this.swalConfirm.close();
        this.navController.back();
      }, 1500);
    });
  }
}
