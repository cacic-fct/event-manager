import { Timestamp } from '@firebase/firestore-types';
import { Router } from '@angular/router';
import { MajorEventItem, MajorEventSubscription } from '../shared/services/major-event.service';
import { Component, OnInit } from '@angular/core';
import { BehaviorSubject, combineLatest, map, Observable, switchMap } from 'rxjs';
import { AngularFirestore, DocumentReference, DocumentSnapshot } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';

import { trace } from '@angular/fire/compat/performance';

import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { fromUnixTime } from 'date-fns';
import { EnrollmentTypesService } from '../shared/services/enrollment-types.service';
@UntilDestroy()
@Component({
  selector: 'app-page-subscriptions',
  templateUrl: './page-subscriptions.page.html',
  styleUrls: ['./page-subscriptions.page.scss'],
})
export class PageSubscriptionsPage implements OnInit {
  subscriptions$: Observable<Subscription[]>;

  today: Date = new Date();

  constructor(
    public afs: AngularFirestore,
    public auth: AngularFireAuth,
    public enrollmentTypes: EnrollmentTypesService
  ) {}

  ngOnInit() {
    this.auth.user.pipe(untilDestroyed(this)).subscribe((user) => {
      if (user) {
        this.subscriptions$ = this.afs
          .collection<Subscription>(`users/${user.uid}/majorEventSubscriptions`)
          .valueChanges({ idField: 'id' })
          .pipe(
            untilDestroyed(this),
            trace('firestore'),
            map((subscriptions) => {
              return subscriptions.map((subscription) => {
                return {
                  id: subscription.id,
                  userData: subscription.reference.get().then((doc) => {
                    return doc.data();
                  }),
                  majorEvent: this.afs
                    .doc<MajorEventItem>(`majorEvents/${subscription.id}`)
                    .valueChanges({ idField: 'id' }),
                };
              });
            })
          );
      }
    });
  }

  getDateFromTimestamp(timestamp: Timestamp): Date {
    return fromUnixTime(timestamp.seconds);
  }

  isInSubscriptionPeriod(endDateTimestamp: Timestamp): boolean {
    if (endDateTimestamp) {
      const endDate = fromUnixTime(endDateTimestamp.seconds);
      return this.today < endDate;
    }
    return false;
  }

  isPastEvent(endDateTimestamp: Timestamp): boolean {
    if (endDateTimestamp) {
      const endDate = fromUnixTime(endDateTimestamp.seconds);
      return this.today > endDate;
    }
    return false;
  }

  getCardType(majorEvent: MajorEventItem, subscription: MajorEventSubscription): number {
    const eventEndDate = fromUnixTime(majorEvent.eventEndDate.seconds);
    if (this.today > eventEndDate && subscription.payment.status === 2) return -1;
    return subscription.payment.status;
  }
}

interface Subscription {
  id?: string;
  reference?: DocumentReference<MajorEventSubscription>;
  userData?: Promise<MajorEventSubscription>;
  majorEvent?: Observable<MajorEventItem>;
}
