// @ts-strict-ignore
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { Component, Input, OnChanges, OnInit } from '@angular/core';
import { DateService } from '../../../../shared/services/date.service';

import { startOfDay, startOfWeek, sub } from 'date-fns';

import { ToastController } from '@ionic/angular/standalone';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { switchMap } from 'rxjs/operators';
import { AsyncPipe, formatDate, KeyValuePipe } from '@angular/common';

import { EventItem } from 'src/app/shared/services/event';
import { trace } from '@angular/fire/compat/performance';

import {
  IonContent,
  IonList,
  IonButton,
  IonLabel,
  IonListHeader,
  IonItemDivider,
  IonProgressBar,
  IonSkeletonText,
} from '@ionic/angular/standalone';
import { ItemListComponent } from 'src/app/tabs/calendar/components/item-list/item-list.component';

@Component({
  selector: 'app-calendar-list-view',
  templateUrl: './calendar-list-view.component.html',
  styleUrls: ['./calendar-list-view.component.scss'],
  standalone: true,
  imports: [
    IonContent,
    IonList,
    IonButton,
    IonLabel,
    IonListHeader,
    IonItemDivider,
    IonProgressBar,
    IonSkeletonText,
    AsyncPipe,
    ItemListComponent,
    KeyValuePipe,
  ],
})
export class CalendarListViewComponent implements OnInit, OnChanges {
  @Input() filter: {
    courses: string[];
  };

  courseFilter$ = new BehaviorSubject<{
    courses: string[];
  } | null>(null);
  dateFilter$ = new BehaviorSubject<Date | null>(null);

  loadOlderCount = 0;

  items$: Observable<EventItem[]>;

  baseDate: Date = startOfDay(new Date());

  constructor(
    private afs: AngularFirestore,
    private toastController: ToastController,
    public dateService: DateService
  ) {}

  ngOnInit() {
    this.dateFilter$.next(this.baseDate);

    this.items$ = combineLatest([this.courseFilter$, this.dateFilter$]).pipe(
      switchMap(([filter, date]) => {
        return this.afs
          .collection<EventItem>('events', (ref) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query: any = ref;
            if (date) {
              query = query.where('eventStartDate', '>=', this.baseDate);
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
    this.courseFilter$.next(this.filter);
  }

  formatDate(date: Date): string {
    let formated = formatDate(date, "EEEE, dd 'de' MMMM 'de' yyyy", 'pt-BR');

    formated = formated.charAt(0).toUpperCase() + formated.slice(1);
    return formated;
  }

  formatMonth(date: Date): string {
    let formated = formatDate(date, "MMMM 'de' yyyy", 'pt-BR');

    formated = formated.charAt(0).toUpperCase() + formated.slice(1);
    return formated;
  }

  loadOlderEvents() {
    if (this.loadOlderCount === 0) {
      this.baseDate = startOfWeek(this.baseDate);
    }

    if (this.loadOlderCount > 3) {
      return;
    }

    this.loadOlderCount += 1;
    this.presentToast();
    this.baseDate = sub(this.baseDate, { weeks: 1 });
    this.dateFilter$.next(this.baseDate);
  }

  async presentToast() {
    const toast = await this.toastController.create({
      header: 'Procurando por eventos mais antigos...',
      message: 'De até ' + this.loadOlderCount + (this.loadOlderCount === 1 ? ' semana ' : ' semanas ') + 'atrás',
      icon: 'search',
      position: 'bottom',
      duration: 1000,
      buttons: [],
    });
    toast.present();
  }
}
