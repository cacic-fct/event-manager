import { Component, OnInit } from '@angular/core';
import { parseISO } from 'date-fns';
import { Observable } from 'rxjs';

import { Timestamp } from '@firebase/firestore-types';
import { User } from 'src/app/shared/services/user';

@Component({
  selector: 'app-page-attendance-collect',
  templateUrl: './page-attendance.page.html',
  styleUrls: ['./page-attendance.page.scss'],
})
export class PageAttendancePage implements OnInit {
  dateValue: string = new Date().toISOString();
  dateDate: Date = new Date(this.dateValue);
  constructor() {}

  ngOnInit() {}

  updateDate(date: string | string[]): void {
    if (typeof date !== 'string') {
      return;
    }
    this.dateValue = date;
    this.dateDate = parseISO(date);
  }
}

export interface Attendance {
  user: Observable<User>;
  time: Timestamp;
  id?: string;
}
