// @ts-strict-ignore
import { Component, inject } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { trace } from '@angular/fire/compat/performance';
import { compareAsc, subMonths, startOfDay } from 'date-fns';
import { take, map, Observable } from 'rxjs';

import { MajorEventItem } from 'src/app/shared/services/major-event.service';
import { MajorEventSubscription } from 'src/app/shared/services/major-event.service';
import { DateService } from 'src/app/shared/services/date.service';
import { user, Auth } from '@angular/fire/auth';

import { AsyncPipe } from '@angular/common';

import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonCard,
  IonButton,
  IonIcon,
  IonProgressBar,
  IonRouterLink,
} from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { HeaderComponent } from 'src/app/shared/components/major-event-display/header/header.component';
import { DescriptionComponent } from 'src/app/shared/components/major-event-display/description/description.component';
import { DateComponent } from 'src/app/shared/components/major-event-display/date/date.component';
import { PriceComponent } from 'src/app/shared/components/major-event-display/price/price.component';

@Component({
  selector: 'app-major-events-display',
  templateUrl: 'major-events-display.page.html',
  styleUrls: ['major-events-display.page.scss'],
  standalone: true,
  imports: [
    AsyncPipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonCard,
    IonButton,
    IonIcon,
    IonProgressBar,
    RouterLink,
    IonRouterLink,
    HeaderComponent,
    DescriptionComponent,
    DateComponent,
    PriceComponent,
  ],
})
export class MajorEventsDisplayPage {
  private auth: Auth = inject(Auth);
  user$ = user(this.auth);

  majorEvents$: Observable<
    (MajorEventItem & {
      isSubscribed: Observable<boolean>;
    })[]
  >;
  today: Date = new Date();

  constructor(
    public afs: AngularFirestore,
    public dateService: DateService,
  ) {}

  ngOnInit() {
    this.user$.pipe(take(1)).subscribe((user) => {
      this.majorEvents$ = this.afs
        .collection<MajorEventItem>('majorEvents', (ref) => {
          let query: any = ref;

          // TODO: Show events in which the subscription opens in the next 2 weeks AND events that ended in the last 2 weeks
          const threeMonthsAgo = subMonths(startOfDay(this.today), 3);
          query = query.where('eventStartDate', '>=', threeMonthsAgo);

          return query.orderBy('eventStartDate', 'asc').limit(5);
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
                        }),
                      )
                  : null,
              };
            });
          }),
        );
    });
  }

  isTodayBetweenDates(date1: Date, date2: Date) {
    const leftCompare = compareAsc(date1, this.today);
    const rightCompare = compareAsc(date2, this.today);

    return leftCompare <= 0 && rightCompare >= 0;
  }
}
