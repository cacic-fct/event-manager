import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { Component, Input, OnChanges, OnInit } from '@angular/core';
import { CoursesService } from 'src/app/shared/services/courses.service';

import { startOfDay, endOfDay, fromUnixTime } from 'date-fns';

import { AngularFirestore } from '@angular/fire/compat/firestore';
import { switchMap } from 'rxjs/operators';
import { DomSanitizer } from '@angular/platform-browser';
import { parse } from 'twemoji-parser';

import { EventItem } from 'src/app/shared/services/event';
import { trace } from '@angular/fire/compat/performance';

import { Timestamp } from '@firebase/firestore-types';

@Component({
  selector: 'app-item-list',
  templateUrl: './item-list.component.html',
  styleUrls: ['./item-list.component.scss'],
})
export class ItemListComponent implements OnInit, OnChanges {
  courses = CoursesService.courses;

  @Input() date: Date;
  @Input() filter: Array<string>;

  dateFilter$: BehaviorSubject<Date | null> = new BehaviorSubject(null);
  courseFilter$: BehaviorSubject<Array<string> | null> = new BehaviorSubject(null);

  items$: Observable<EventItem[]>;

  constructor(private afs: AngularFirestore, private sanitizer: DomSanitizer) {}

  ngOnInit() {
    this.items$ = combineLatest([this.dateFilter$, this.courseFilter$]).pipe(
      switchMap(([date, filter]) => {
        return this.afs
          .collection<EventItem>('events', (ref) => {
            let query: any = ref;
            if (date) {
              query = query
                .where('eventStartDate', '>=', startOfDay(date))
                .where('eventStartDate', '<=', endOfDay(date));
            }
            if (filter.length > 0) {
              query = query.where('course', 'in', filter);
            }

            return query.orderBy('eventStartDate', 'asc');
          })
          .valueChanges({ idField: 'id' })
          .pipe(trace('firestore'));
      })
    );
  }

  ngOnChanges() {
    this.dateFilter$.next(this.date);
    this.courseFilter$.next(this.filter);
  }

  getDateFromTimestamp(timestamp: Timestamp): Date {
    return fromUnixTime(timestamp.seconds);
  }

  getEmoji(emoji: string): any {
    if (emoji === undefined || !/^\p{Emoji}$/u.test('emoji')) {
      return this.sanitizer.bypassSecurityTrustResourceUrl(parse('❔')[0].url);
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(parse(emoji)[0].url);
  }
}
