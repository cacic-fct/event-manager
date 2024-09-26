// @ts-strict-ignore
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { Component, Input, OnChanges, OnInit } from '@angular/core';
import { CoursesService } from 'src/app/shared/services/courses.service';

import { startOfDay, endOfDay } from 'date-fns';

import { AngularFirestore } from '@angular/fire/compat/firestore';
import { shareReplay, switchMap, take } from 'rxjs/operators';

import { EventItem } from 'src/app/shared/services/event';
import { trace } from '@angular/fire/compat/performance';

import { EmojiService } from '../../../../shared/services/emoji.service';
import { DateService } from 'src/app/shared/services/date.service';

import { IonList, IonProgressBar } from '@ionic/angular/standalone';
import { ItemListComponent } from 'src/app/tabs/calendar/components/item-list/item-list.component';
import { AsyncPipe } from '@angular/common';
import { AnimationOptions, LottieComponent } from 'ngx-lottie';

@Component({
  selector: 'app-item-list-view',
  templateUrl: './item-list-view.component.html',
  styleUrls: ['./item-list-view.component.scss'],
  standalone: true,
  imports: [IonList, IonProgressBar, ItemListComponent, AsyncPipe, LottieComponent],
})
export class ItemListViewComponent implements OnInit, OnChanges {
  courses = CoursesService.courses;

  @Input() date: Date;
  @Input() filter: {
    courses: string[];
  };

  dateFilter$ = new BehaviorSubject<Date | null>(null);
  courseFilter$ = new BehaviorSubject<{
    courses: string[];
  } | null>(null);

  items$: Observable<EventItem[]>;

  lottieOptions: AnimationOptions = {
    path: '/assets/animations/no-results.json',
  };

  constructor(
    private afs: AngularFirestore,
    public emojiService: EmojiService,
    public dateService: DateService,
  ) {}

  ngOnInit() {
    this.items$ = combineLatest([this.dateFilter$, this.courseFilter$]).pipe(
      switchMap(([date, filter]) => {
        return this.afs
          .collection<EventItem>('events', (ref) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          .pipe(trace('firestore'), take(1), shareReplay(1));
      }),
    );
  }

  ngOnChanges() {
    this.dateFilter$.next(this.date);
    this.courseFilter$.next(this.filter);
  }
}
