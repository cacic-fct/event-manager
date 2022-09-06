import { Component } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { trace } from '@angular/fire/compat/performance';
import { Timestamp } from '@firebase/firestore-types';
import { compareAsc, fromUnixTime } from 'date-fns';
import { Observable } from 'rxjs';

import { MajorEventItem } from '../shared/services/major-event';

@Component({
  selector: 'app-tab-events',
  templateUrl: 'tab-events.page.html',
  styleUrls: ['tab-events.page.scss'],
})
export class TabEventsPage {
  majorEvents$: Observable<MajorEventItem[]>;
  today: Date = new Date();

  constructor(public afs: AngularFirestore, public auth: AngularFireAuth) {
    this.majorEvents$ = this.afs
      .collection<MajorEventItem>('majorEvents', (ref) => {
        return ref.orderBy('dateStart', 'asc');
      })
      .valueChanges({ idField: 'id' })
      .pipe(trace('firestore'));
  }

  ngOnInit() {}

  getDateFromTimestamp(timestamp: Timestamp): Date {
    return fromUnixTime(timestamp.seconds);
  }

  isTodayBetweenDates(date1: Date, date2: Date) {
    const leftCompare = compareAsc(date1, this.today);
    const rightCompare = compareAsc(date2, this.today);

    return leftCompare <= 0 && rightCompare >= 0;
  }
}
