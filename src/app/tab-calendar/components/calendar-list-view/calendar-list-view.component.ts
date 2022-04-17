import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { Component, Input, OnChanges } from '@angular/core';
import { CoursesService } from 'src/app/shared/services/courses.service';

import { parse } from 'twemoji-parser';

import { fromUnixTime, isSameDay, isSameMonth, startOfDay, startOfWeek, sub } from 'date-fns';

import { NavController, ToastController } from '@ionic/angular';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { switchMap } from 'rxjs/operators';
import { formatDate } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';

import { EventItem } from 'src/app/shared/services/event';
import { trace } from '@angular/fire/compat/performance';

@Component({
  selector: 'app-calendar-list-view',
  templateUrl: './calendar-list-view.component.html',
  styleUrls: ['./calendar-list-view.component.scss'],
})
export class CalendarListViewComponent implements OnChanges {
  courses = CoursesService.courses;

  @Input() filter: Array<string>;

  courseFilter$: BehaviorSubject<Array<string> | null>;
  dateFilter$: BehaviorSubject<Date | null>;

  loadOlderCount: number = 0;

  items$: Observable<EventItem[]>;

  baseDate: Date = startOfDay(new Date());

  constructor(
    firestore: AngularFirestore,
    private navCtrl: NavController,
    private sanitizer: DomSanitizer,
    private toastController: ToastController
  ) {
    this.dateFilter$ = new BehaviorSubject(null);
    this.courseFilter$ = new BehaviorSubject(null);
    this.dateFilter$.next(this.baseDate);

    this.items$ = combineLatest([this.courseFilter$, this.dateFilter$]).pipe(
      switchMap(([filter, date]) => {
        return firestore
          .collection<EventItem>('events', (ref) => {
            let query: any = ref;
            if (date) {
              query = query.where('date', '>=', this.baseDate);
            }
            if (filter.length > 0) {
              query = query.where('course', 'in', filter);
            }

            return query.orderBy('date', 'asc');
          })
          .valueChanges({ idField: 'id' })
          .pipe(trace('firestore'));
      })
    );
  }

  ngOnChanges() {
    this.courseFilter$.next(this.filter);
  }

  public openItem(item: any): void {
    this.navCtrl.navigateForward(['calendario/evento', item.id], {
      state: { item: item },
    });
  }

  getDateFromTimestamp(timestamp: any): Date {
    return fromUnixTime(parseInt(timestamp.seconds));
  }

  getEmoji(emoji: string): any {
    if (emoji === undefined) {
      return this.sanitizer.bypassSecurityTrustResourceUrl(parse('❔')[0].url);
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(parse(emoji)[0].url);
  }

  dayCompare(date1: any, date2: any) {
    return isSameDay(fromUnixTime(date1), fromUnixTime(date2));
  }

  monthCompare(date1: any, date2: any) {
    return isSameMonth(fromUnixTime(date1), fromUnixTime(date2));
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
    if (this.loadOlderCount == 0) {
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
      message: 'De até ' + this.loadOlderCount + (this.loadOlderCount == 1 ? ' semana ' : ' semanas ') + 'atrás',
      icon: 'search',
      position: 'bottom',
      duration: 500,
      buttons: [],
    });
    toast.present();
  }
}
