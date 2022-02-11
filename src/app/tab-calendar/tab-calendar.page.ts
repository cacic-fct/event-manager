import { Component } from '@angular/core';
import { KeyValue } from '@angular/common';

// Angular firebase
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-tab-calendar',
  templateUrl: 'tab-calendar.page.html',
  styleUrls: ['tab-calendar.page.scss'],
})
export class TabCalendarPage {
  constructor(firestore: AngularFirestore) {
    this.items = firestore.collection('events').valueChanges();
  }

  items: Observable<any[]>;
  dow1Char = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  // Selected calendar date
  active = '';

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

  filter() {}

  originalOrder = (
    a: KeyValue<string, {}>,
    b: KeyValue<string, Date>
  ): number => {
    return 0;
  };

  ngAfterViewInit() {
    this.generateCalendar();
  }

  // On click, set active class to clicked element
  dateClick(string) {
    if (string.target.id === this.active) {
      return 0;
    }

    // Remove active class from active element
    document.getElementById(this.active).classList.remove('active');

    // Set active to clicked element
    this.active = string.target.id;

    // Add active class to clicked element
    string.target.classList.add('active');

    this.refreshDateFull();
  }

  refreshDateFull() {
    // Set element date-full innerHTML to day of week of active date
    let dowstring = this.dowList[this.active].date.toLocaleDateString('pt-BR', {
      weekday: 'long',
    });

    // Capitalize first letter of dowstring
    dowstring = dowstring.charAt(0).toUpperCase() + dowstring.slice(1);

    let dowday = this.dowList[this.active].date.toLocaleDateString('pt-BR', {
      day: 'numeric',
    });
    let dowmonth = this.dowList[this.active].date.toLocaleDateString('pt-BR', {
      month: 'long',
    });
    let dowyear = this.dowList[this.active].date.toLocaleDateString('pt-BR', {
      year: 'numeric',
    });

    document.getElementById('date-full').innerHTML =
      dowstring + ', ' + dowday + ' de ' + dowmonth + ' de ' + dowyear;
    document.getElementById(this.active).innerHTML;
  }

  generateCalendar() {
    // This is sunday in the calendar
    // Use '/' as date separators due to Safari inconsistencies
    // YYYY/MM/DD 00:00:00
    let calendarBaseDate = new Date('2022/02/06 00:00:00');

    // Add one day to date
    function addOneDay(date) {
      date.setDate(date.getDate() + 1);
      return date;
    }

    // Get only day from date
    function getDay(date) {
      return date.getDate();
    }

    let today = new Date();

    // YYYY/MM/DD
    let todayISO = today.toISOString().slice(0, 10);

    for (let dow in this.dowList) {
      // Get element in DOM
      let dowElement = document.getElementById(dow);

      // Insert calendarBaseDate in dowList object
      this.dowList[dow].date = new Date(calendarBaseDate);

      // Insert date in inner html
      dowElement.innerHTML = getDay(calendarBaseDate);

      // If today matches YYYY-MM-DD calendarBaseDate, set class to active
      if (todayISO == calendarBaseDate.toISOString().slice(0, 10)) {
        dowElement.classList.add('active');
        this.active = dow;
      }

      // Add one day to calendarBaseDate
      calendarBaseDate = addOneDay(calendarBaseDate);
    }

    // If not active, set monday as active
    if (this.active === '') {
      document.getElementById('monday').classList.add('active');
    }

    // refreshDatefull() pass this.dowList
    this.refreshDateFull.bind(this)();
  }
}
