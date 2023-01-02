import { Injectable } from '@angular/core';
import { compareAsc, fromUnixTime, isSameDay, isSameMonth } from 'date-fns';
import { Timestamp } from '@firebase/firestore-types';
import * as firestore from '@firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class DateService {
  constructor() {}

  isBetweenDates(date1: Date, date2: Date, dateToCompare: Date): boolean {
    return compareAsc(date1, dateToCompare) === -1 && compareAsc(dateToCompare, date2) === -1;
  }

  today(): Date {
    return new Date();
  }

  // Firestore timestamp

  getDateFromTimestamp(timestamp: Timestamp): Date {
    return fromUnixTime(timestamp.seconds);
  }

  compareDayTimestamp(date1: Timestamp, date2: Timestamp): boolean {
    return isSameDay(this.getDateFromTimestamp(date1), this.getDateFromTimestamp(date2));
  }

  compareMonthTimestamp(date1: Timestamp, date2: Timestamp): boolean {
    return isSameMonth(fromUnixTime(date1.seconds), fromUnixTime(date2.seconds));
  }

  timestampFromDate(date: Date): Timestamp {
    return firestore.Timestamp.fromDate(date);
  }
}
