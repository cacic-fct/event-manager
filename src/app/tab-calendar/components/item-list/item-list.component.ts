import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { Component, Input, OnChanges } from '@angular/core';
import { CoursesService } from 'src/app/shared/services/courses.service';

import { startOfDay, endOfDay, fromUnixTime, getDate } from 'date-fns';

import { NavController } from '@ionic/angular';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { switchMap } from 'rxjs/operators';
import { DomSanitizer } from '@angular/platform-browser';
import { parse } from 'twemoji-parser';

import { EventItem } from 'src/app/shared/services/event';

@Component({
  selector: 'app-item-list',
  templateUrl: './item-list.component.html',
  styleUrls: ['./item-list.component.scss'],
})
export class ItemListComponent implements OnChanges {
  courses = CoursesService.courses;

  @Input() date: Date;
  @Input() filter: Array<string>;

  dateFilter$: BehaviorSubject<Date | null>;
  courseFilter$: BehaviorSubject<Array<string> | null>;

  items$: Observable<EventItem[]>;

  constructor(
    firestore: AngularFirestore,
    private navCtrl: NavController,
    private sanitizer: DomSanitizer
  ) {
    this.dateFilter$ = new BehaviorSubject(null);
    this.courseFilter$ = new BehaviorSubject(null);

    this.items$ = combineLatest([this.dateFilter$, this.courseFilter$]).pipe(
      switchMap(([date, filter]) => {
        return firestore
          .collection<EventItem>('events', (ref) => {
            let query: any = ref;
            if (date) {
              query = query
                .where('date', '>=', startOfDay(date))
                .where('date', '<=', endOfDay(date));
            }
            if (filter.length > 0) {
              query = query.where('course', 'in', filter);
            }
            if (localStorage.getItem('isUnesp') !== 'true') {
              query = query.where('public', '==', true);
            }

            return query.orderBy('date', 'asc');
          })
          .valueChanges({ idField: 'id' });
      })
    );
  }

  ngOnChanges() {
    this.dateFilter$.next(this.date);
    this.courseFilter$.next(this.filter);
  }

  getDateFromTimestamp(timestamp: any): Date {
    return fromUnixTime(timestamp);
  }

  getEmoji(emoji: string): any {
    if (emoji === undefined) {
      return this.sanitizer.bypassSecurityTrustResourceUrl(parse('❔')[0].url);
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(parse(emoji)[0].url);
  }

  // Emoji to codepoint
  getEmojiCode(emoji: string): string {
    if (emoji === undefined) {
      return '❔'.codePointAt(0).toString(16);
    }
    return emoji.codePointAt(0).toString(16);
  }
}
