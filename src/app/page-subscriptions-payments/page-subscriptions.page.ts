import { EventItem, EventSubscription } from 'src/app/shared/services/event';
import { Timestamp } from '@firebase/firestore-types';
import { MajorEventItem, MajorEventSubscription } from '../shared/services/major-event.service';
import { Component, OnInit } from '@angular/core';
import { map, Observable, forkJoin, switchMap, combineLatest } from 'rxjs';
import { AngularFirestore, DocumentReference } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';

import { trace } from '@angular/fire/compat/performance';

import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { fromUnixTime } from 'date-fns';
import { EnrollmentTypesService } from '../shared/services/enrollment-types.service';
import { Router } from '@angular/router';
@UntilDestroy()
@Component({
  selector: 'app-page-subscriptions',
  templateUrl: './page-subscriptions.page.html',
  styleUrls: ['./page-subscriptions.page.scss'],
})
export class PageSubscriptionsPage implements OnInit {
  subscriptions$: Observable<Subscription[]>;
  eventSubscriptions$: Observable<EventSubscriptionLocal[]>;

  today: Date = new Date();

  constructor(
    public afs: AngularFirestore,
    public auth: AngularFireAuth,
    public enrollmentTypes: EnrollmentTypesService,
    private router: Router
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
                  userData: this.afs
                    .doc<MajorEventSubscription>(`majorEvents/${subscription.id}/subscriptions/${user.uid}`)
                    .valueChanges(),
                  majorEvent: this.afs
                    .doc<MajorEventItem>(`majorEvents/${subscription.id}`)
                    .valueChanges({ idField: 'id' }),
                };
              });
            })
          );

        this.eventSubscriptions$ = this.afs
          .collection<EventSubscriptionLocal>(`users/${user.uid}/eventSubscriptions`)
          .valueChanges({ idField: 'id' })
          .pipe(
            trace('firestore'),
            map((subscriptions) => {
              const arrayOfEvents: Observable<EventItem>[] = subscriptions.map((subscription) => {
                return this.afs.doc<EventItem>(`events/${subscription.id}`).valueChanges({ idField: 'id' });
              });

              let observableArrayOfEvents: Observable<EventItem[]> = combineLatest(arrayOfEvents);

              observableArrayOfEvents = observableArrayOfEvents.pipe(
                map((events) => {
                  return events.sort((a, b) => {
                    return a.eventStartDate.seconds - b.eventStartDate.seconds;
                  });
                })
              );

              return observableArrayOfEvents.pipe(
                map((events) => {
                  return events.map((event) => {
                    return {
                      id: event.id,
                      event: event,
                      userData: this.afs
                        .doc<EventSubscription>(`events/${event.id}/subscriptions/${user.uid}`)
                        .valueChanges(),
                    };
                  });
                })
              );
            }),
            switchMap((observable) => observable)
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
  userData?: Observable<MajorEventSubscription>;
  majorEvent?: Observable<MajorEventItem>;
}

interface EventSubscriptionLocal {
  id?: string;
  reference?: DocumentReference<any>;
  userData?: Observable<EventSubscription>;
  event?: EventItem;
}
