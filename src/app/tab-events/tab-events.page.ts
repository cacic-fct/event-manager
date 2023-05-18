// @ts-strict-ignore
import { Component, inject } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { trace } from '@angular/fire/compat/performance';
import { compareAsc } from 'date-fns';
import { take, map, Observable } from 'rxjs';

import { MajorEventItem } from '../shared/services/major-event.service';
import { MajorEventSubscription } from './../shared/services/major-event.service';
import { DateService } from 'src/app/shared/services/date.service';
import { user, Auth } from '@angular/fire/auth';

@Component({
  selector: 'app-tab-events',
  templateUrl: 'tab-events.page.html',
  styleUrls: ['tab-events.page.scss'],
})
export class TabEventsPage {
  private auth: Auth = inject(Auth);
  user$ = user(this.auth);

  majorEvents$: Observable<
    (MajorEventItem & {
      isSubscribed: Observable<boolean>;
    })[]
  >;
  today: Date = new Date();

  constructor(public afs: AngularFirestore, public dateService: DateService) {}

  ngOnInit() {
    this.user$.pipe(take(1)).subscribe((user) => {
      this.majorEvents$ = this.afs
        .collection<MajorEventItem>('majorEvents', (ref) => {
          return ref.orderBy('eventStartDate', 'asc').limit(5);
        })
        .valueChanges({ idField: 'id' })
        .pipe(
          trace('firestore'),
          map((event) => {
            return event.map((event) => {
              return {
                ...event,
                isSubscribed: user
                  ? this.afs
                      .doc(`users/${user.uid}/majorEventSubscriptions/${event.id}`)
                      .get()
                      .pipe(
                        map((doc) => {
                          if (doc.exists) {
                            const data = doc.data() as MajorEventSubscription;
                            if (data.payment?.status === 4) {
                              return false;
                            }
                          }
                          return doc.exists;
                        })
                      )
                  : null,
              };
            });
          })
        );
    });
  }

  isTodayBetweenDates(date1: Date, date2: Date) {
    const leftCompare = compareAsc(date1, this.today);
    const rightCompare = compareAsc(date2, this.today);

    return leftCompare <= 0 && rightCompare >= 0;
  }
}
