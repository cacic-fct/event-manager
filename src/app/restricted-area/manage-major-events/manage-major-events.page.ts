// @ts-strict-ignore
import { Component, OnInit } from '@angular/core';
import { startOfMonth, endOfMonth, parseISO, addYears } from 'date-fns';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { BehaviorSubject, combineLatest, Observable, switchMap } from 'rxjs';
import { MajorEventItem } from 'src/app/shared/services/major-event.service';
import { trace } from '@angular/fire/compat/performance';
import { CoursesService } from 'src/app/shared/services/courses.service';
import { DateService } from 'src/app/shared/services/date.service';
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonIcon,
  IonContent,
  IonItem,
  IonList,
  IonGrid,
  IonRow,
  IonCol,
  IonLabel,
  IonProgressBar,
  IonModal,
  IonButton,
  IonDatetime,
  IonDatetimeButton,
  IonRouterLink,
} from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { AsyncPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-manage-major-events',
  templateUrl: './manage-major-events.page.html',
  styleUrls: ['./manage-major-events.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonRouterLink,
    AsyncPipe,
    DatePipe,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonIcon,
    IonContent,
    IonItem,
    IonList,
    IonGrid,
    IonRow,
    IonCol,
    IonLabel,
    IonProgressBar,
    IonModal,
    IonButton,
    IonDatetime,
    IonDatetimeButton,
    FormsModule,
  ],
})
export class ManageMajorEventsPage implements OnInit {
  today: Date = new Date();
  currentMonth: string = this.today.toISOString();
  currentMonth$: BehaviorSubject<string | null> = new BehaviorSubject(this.currentMonth);
  majorEvents$: Observable<MajorEventItem[]>;

  constructor(private afs: AngularFirestore, public courses: CoursesService, public dateService: DateService) {}

  ngOnInit() {
    this.majorEvents$ = combineLatest([this.currentMonth$]).pipe(
      switchMap(([date]) => {
        return this.afs
          .collection<MajorEventItem>('majorEvents', (ref) => {
            let query: any = ref;
            query = query
              .where('eventStartDate', '<=', endOfMonth(parseISO(date)))
              .where('eventStartDate', '>=', startOfMonth(parseISO(date)));
            return query;
          })
          .valueChanges({ idField: 'id' })
          .pipe(trace('firestore'));
      })
    );
  }

  getLimitDate(): string {
    return addYears(this.today, 1).toISOString();
  }

  onMonthChange() {
    this.currentMonth$.next(this.currentMonth);
  }
}
