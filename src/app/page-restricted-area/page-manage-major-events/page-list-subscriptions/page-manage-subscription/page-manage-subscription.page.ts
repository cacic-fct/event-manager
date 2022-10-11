import { User } from './../../../../shared/services/user';
import { EventItem } from './../../../../shared/services/event';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { serverTimestamp } from '@angular/fire/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { MajorEventSubscription } from './../../../../shared/services/major-event.service';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { ActivatedRoute } from '@angular/router';
import { Component, OnInit } from '@angular/core';
import { Observable, map, take, combineLatest } from 'rxjs';
import { trace } from '@angular/fire/compat/performance';
import { fromUnixTime } from 'date-fns';

import { Timestamp as TimestampType } from '@firebase/firestore-types';

@UntilDestroy()
@Component({
  selector: 'app-page-manage-subscription',
  templateUrl: './page-manage-subscription.page.html',
  styleUrls: ['./page-manage-subscription.page.scss'],
})
export class PageManageSubscriptionPage implements OnInit {
  subscriptionID = this.route.snapshot.paramMap.get('subscriptionID');
  majorEventID = this.route.snapshot.paramMap.get('eventID');

  subscription$: Observable<MajorEventSubscription>;

  userData$: Observable<User>;

  eventsUserIsSubscribedTo$: Observable<EventItem[]>;

  constructor(private route: ActivatedRoute, private afs: AngularFirestore, private auth: AngularFireAuth) {}

  ngOnInit() {
    this.userData$ = this.afs.doc<User>(`users/${this.subscriptionID}`).valueChanges().pipe(untilDestroyed(this));

    this.subscription$ = this.afs
      .doc<MajorEventSubscription>(`majorEvents/${this.majorEventID}/subscriptions/${this.subscriptionID}`)
      .valueChanges()
      .pipe(untilDestroyed(this));

    this.subscription$.subscribe((data) => {
      let tempArray: Observable<EventItem>[] = [];

      data.subscribedToEvents.map((event) => {
        tempArray.push(this.afs.doc<EventItem>(`events/${event}`).valueChanges().pipe(take(1), trace('firestore')));
      });

      let observableArrayOfEvents = combineLatest(tempArray);

      observableArrayOfEvents = observableArrayOfEvents.pipe(
        map((events) => {
          return events.sort((a, b) => {
            return a.eventStartDate.toMillis() - b.eventStartDate.toMillis();
          });
        })
      );

      this.eventsUserIsSubscribedTo$ = observableArrayOfEvents;
    });
  }

  forceEventEdit() {
    this.auth.user.subscribe((user) => {
      this.afs
        .doc<MajorEventSubscription>(`majorEvents/${this.majorEventID}/subscriptions/${this.subscriptionID}`)
        .get()
        .subscribe((doc) => {
          const data = doc.data();
          data.subscribedToEvents.forEach((event) => {
            this.afs.doc(`events/${event}/subscriptions/${this.subscriptionID}`).delete();
          });

          this.afs.doc(`majorEvents/${this.majorEventID}/subscriptions/${this.subscriptionID}`).update({
            'payment.status': 1,
            'payment.author': user.uid,
            'payment.time': serverTimestamp(),
          });
        });
    });
  }

  getDateFromTimestamp(timestamp: TimestampType): Date {
    return fromUnixTime(timestamp.seconds);
  }
}
