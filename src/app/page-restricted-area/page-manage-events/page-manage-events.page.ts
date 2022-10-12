import { Component, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { trace } from '@angular/fire/compat/performance';
import { addYears, endOfMonth, fromUnixTime, parseISO, startOfMonth } from 'date-fns';
import { BehaviorSubject, combineLatest, first, map, Observable, switchMap } from 'rxjs';
import { EventItem } from 'src/app/shared/services/event';
import { Timestamp } from '@firebase/firestore-types';
import { CoursesService } from 'src/app/shared/services/courses.service';
import { MajorEventItem } from 'src/app/shared/services/major-event.service';
import { DomSanitizer } from '@angular/platform-browser';
import { parse } from 'twemoji-parser';

interface EventItemQuery extends EventItem {
  inMajorEventName?: Observable<string>;
}

@Component({
  selector: 'app-page-manage-events',
  templateUrl: './page-manage-events.page.html',
  styleUrls: ['./page-manage-events.page.scss'],
})
export class PageManageEvents implements OnInit {
  today: Date = new Date();
  currentMonth: string = this.today.toISOString();
  currentMonth$: BehaviorSubject<string | null> = new BehaviorSubject(this.currentMonth);
  events$: Observable<EventItemQuery[]>;
  constructor(private afs: AngularFirestore, public courses: CoursesService, private sanitizer: DomSanitizer) {}

  ngOnInit() {
    this.events$ = combineLatest([this.currentMonth$]).pipe(
      switchMap(([date]) => {
        return this.afs
          .collection<EventItem>('events', (ref) => {
            let query: any = ref;
            query = query
              .where('eventStartDate', '<=', endOfMonth(parseISO(date)))
              .where('eventStartDate', '>=', startOfMonth(parseISO(date)));
            return query;
          })
          .valueChanges({ idField: 'id' })
          .pipe(
            trace('firestore'),
            map((events) =>
              events.map((event) => {
                let eventObject: EventItemQuery = event;
                if (eventObject.inMajorEvent)
                  eventObject.inMajorEventName = this.getMajorEventName$(event.inMajorEvent);
                return eventObject;
              })
            )
          );
      })
    );
  }

  getMajorEventName$(eventID: string): Observable<string> {
    return this.afs
      .collection<MajorEventItem>('majorEvents')
      .doc(eventID)
      .get()
      .pipe(
        first(),
        map((doc) => doc.data().name)
      );
  }

  getDateFromTimestamp(timestamp: Timestamp): Date {
    return fromUnixTime(timestamp.seconds);
  }

  getLimitDate(): string {
    return addYears(this.today, 1).toISOString();
  }

  onMonthChange() {
    this.currentMonth$.next(this.currentMonth);
  }

  getEmoji(emoji: string): any {
    if (emoji === undefined || !/^\p{Emoji}|\p{Emoji_Modifier}$/u.test(emoji)) {
      // TODO: validar apenas 1 emoji
      return this.sanitizer.bypassSecurityTrustResourceUrl(parse('❔')[0].url);
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(parse(emoji)[0].url);
  }
}
