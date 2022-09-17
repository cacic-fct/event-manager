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
  selector: 'app-event-list',
  templateUrl: './event-list.component.html',
  styleUrls: ['./event-list.component.scss'],
})
export class EventListComponent implements OnInit, OnChanges {
  courses = CoursesService.courses;

  @Input() redirection: string;
  @Input() date: Date;
  @Input() filter: Array<string>;

  dateFilter$: BehaviorSubject<Date | null>;

  items$: Observable<EventItem[]>;

  constructor(private afs: AngularFirestore, private sanitizer: DomSanitizer) {}

  ngOnInit() {
    this.dateFilter$ = new BehaviorSubject(null);

    this.items$ = combineLatest([this.dateFilter$]).pipe(
      switchMap(([date]) => {
        return this.afs
          .collection<EventItem>('events', (ref) => {
            let query: any = ref;
            if (date) {
              query = query
                .where('eventDateStart', '>=', startOfDay(date))
                .where('eventDateStart', '<=', endOfDay(date));
            }
            return query.orderBy('eventDateStart', 'asc');
          })
          .valueChanges({ idField: 'id' })
          .pipe(trace('firestore'));
      })
    );
  }

  ngOnChanges() {
    this.dateFilter$.next(this.date);
  }

  getDateFromTimestamp(timestamp: Timestamp): Date {
    return fromUnixTime(timestamp.seconds);
  }

  getEmoji(emoji: string): any {
    if (emoji === undefined) {
      return this.sanitizer.bypassSecurityTrustResourceUrl(parse('❔')[0].url);
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(parse(emoji)[0].url);
  }
}
