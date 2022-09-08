import { Router } from '@angular/router';
import { Component } from '@angular/core';
import { KeyValue, formatDate } from '@angular/common';
import { Observable } from 'rxjs';

import { CoursesService } from 'src/app/shared/services/courses.service';

import { startOfWeek, endOfWeek, addDays, subDays, isSameDay, getDate, format, isSameWeek } from 'date-fns';
import { ModalController } from '@ionic/angular';
import { FilterModalPage } from './components/filter-modal/filter-modal.page';
import { getBooleanChanges, RemoteConfig } from '@angular/fire/remote-config';
import { ToastController } from '@ionic/angular';
import { trace } from '@angular/fire/compat/performance';

import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
@UntilDestroy()
@Component({
  selector: 'app-tab-calendar',
  templateUrl: 'tab-calendar.page.html',
  styleUrls: ['tab-calendar.page.scss'],
})
export class TabCalendarPage {
  // Selected calendar date
  active: string;
  fullDate: string;
  itemView: boolean = true;
  selectedFilter: string[] = [];

  // Today's date
  today: Date = new Date();

  dow1Char: string[] = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  courses = CoursesService.courses;

  // Limit button clicks
  weekClicks: number = 0;

  // List of days of week and date
  dowList = {
    sunday: { date: Date },
    monday: { date: Date },
    tuesday: { date: Date },
    wednesday: { date: Date },
    thursday: { date: Date },
    friday: { date: Date },
    saturday: { date: Date },
  };

  // This is sunday in the calendar
  // Get startofWeek based on today's date
  calendarBaseDate: Date = startOfWeek(this.today, {
    weekStartsOn: 0,
  });

  // Get end of week from today
  calendarEndDate: Date = endOfWeek(this.today, {
    weekStartsOn: 0,
  });

  constructor(
    private modalController: ModalController,
    public router: Router,
    public remoteConfig: RemoteConfig,
    public toastController: ToastController
  ) {
    getBooleanChanges(remoteConfig, 'calendarItemViewDefault')
      .pipe(untilDestroyed(this), trace('remote-config'))
      .subscribe((value) => {
        this.itemView = value;
      });

    this.active = format(this.today, 'eeee').toLowerCase();
    this.generateCalendarData();
  }

  ngOnInit() {}

  ionViewDidEnter() {
    if (localStorage.getItem('user') === null && sessionStorage.getItem('calendarLoginToast') !== 'true') {
      sessionStorage.setItem('calendarLoginToast', 'true');
      this.presentToast();
    }
  }

  originalOrder = (a: KeyValue<any, any>, b: KeyValue<any, any>): number => {
    return 0;
  };

  prevWeek(): void {
    if (this.weekClicks < -3) {
      return;
    }
    this.weekClicks--;
    this.calendarBaseDate = subDays(this.calendarBaseDate, 7);
    this.generateCalendarData();
  }

  nextWeek(): void {
    if (this.weekClicks > 3) {
      return;
    }
    this.weekClicks++;
    this.calendarBaseDate = addDays(this.calendarBaseDate, 7);
    this.generateCalendarData();
  }

  todayClick(): number {
    if (isSameDay(this.today, this.dowList[this.active].date)) {
      return 1;
    }
    this.weekClicks = 0;

    this.calendarBaseDate = startOfWeek(this.today, {
      weekStartsOn: 0,
    });
    this.generateCalendarData();
  }

  dateSelector(): void {
    // If calendarBaseDate is from this week
    if (isSameWeek(this.calendarBaseDate, this.today)) {
      // Dateclick today's date
      this.dateClick(format(this.today, 'eeee').toLowerCase());
    } else {
      this.dateClick('sunday');
    }
    this.fullDate = this.formatDate();
  }

  // On click, set active class to clicked element
  dateClick(string: string): void {
    this.active = string;
    this.fullDate = this.formatDate();
  }

  formatDate(): string {
    let formated = formatDate(this.dowList[this.active]?.date, "EEEE, dd 'de' MMMM 'de' yyyy", 'pt-BR');

    formated = formated.charAt(0).toUpperCase() + formated.slice(1);
    return formated;
  }

  generateCalendarData(): void {
    let i = 0;
    for (let dow in this.dowList) {
      this.dowList[dow].date = addDays(this.calendarBaseDate, i);
      i++;
    }
    this.dateSelector();
  }

  getDayFromDate(date: Date): number {
    return getDate(date);
  }

  async filter() {
    const modal = await this.modalController.create({
      component: FilterModalPage,
      componentProps: {
        selectedFilter: this.selectedFilter,
      },
      backdropDismiss: false,
      swipeToClose: false,
    });

    modal.onDidDismiss().then((selectedFilter) => {
      if (selectedFilter) {
        // ... changes reference and triggers ngOnChanges
        this.selectedFilter = [...selectedFilter.data.selectedFilter];
        return true;
      }
      return false;
    });
    return await modal.present();
  }
  viewToggle() {
    this.itemView = !this.itemView;
  }

  async presentToast() {
    const toast = await this.toastController.create({
      header: 'Você tem vínculo com a Unesp?',
      message: 'Faça login no menu para visualizar todos os eventos',
      position: 'bottom',
      buttons: [
        {
          side: 'end',
          text: 'Menu',
          handler: () => {
            this.router.navigate(['/menu']);
          },
        },
        {
          side: 'end',
          text: 'Fechar',
          role: 'cancel',
        },
      ],
    });
    await toast.present();
  }
}
