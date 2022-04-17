import { Component, OnInit } from '@angular/core';
import { parseISO } from 'date-fns';

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

  updateDate(date: string) {
    this.dateValue = date;
    this.dateDate = parseISO(date);
  }
}
