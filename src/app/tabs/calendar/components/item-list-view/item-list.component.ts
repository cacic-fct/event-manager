// @ts-strict-ignore
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { Component, Input, OnChanges, OnInit } from '@angular/core';
import { CoursesService } from 'src/app/shared/services/courses.service';

import { startOfDay, endOfDay } from 'date-fns';

import { AngularFirestore } from '@angular/fire/compat/firestore';
import { switchMap } from 'rxjs/operators';

import { EventItem } from 'src/app/shared/services/event';
import { trace } from '@angular/fire/compat/performance';

import { EmojiService } from '../../../../shared/services/emoji.service';
import { DateService } from 'src/app/shared/services/date.service';

import { IonList, IonProgressBar } from '@ionic/angular/standalone';
import { ItemListComponent } from 'src/app/tabs/calendar/components/item-list/item-list.component';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'app-item-list',
  templateUrl: './item-list.component.html',
  styleUrls: ['./item-list.component.scss'],
  standalone: true,
  imports: [IonList, IonProgressBar, ItemListComponent, AsyncPipe],
})
export class ItemListViewComponent implements OnInit, OnChanges {
  courses = CoursesService.courses;

  @Input() date: Date;
  @Input() filter: {
    courses: Array<string>;
  };

  dateFilter$: BehaviorSubject<Date | null> = new BehaviorSubject(null);
  courseFilter$: BehaviorSubject<{
    courses: Array<string>;
  } | null> = new BehaviorSubject(null);

  items$: Observable<EventItem[]>;

  constructor(private afs: AngularFirestore, public emojiService: EmojiService, public dateService: DateService) {}

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
            if (filter['courses'].length > 0) {
              query = query.where('course', 'in', filter['courses']);
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
}
