import { Injectable } from '@angular/core';
import { compareAsc, fromUnixTime, isSameDay, isSameMonth } from 'date-fns';
import { Timestamp as TimestampType } from '@firebase/firestore-types';
import { Timestamp } from '@firebase/firestore';

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

  // Firestore Timestamp

  getDateFromTimestamp(Timestamp: TimestampType): Date {
    return fromUnixTime(Timestamp.seconds);
  }

  compareDayTimestamp(date1: TimestampType, date2: TimestampType): boolean {
    return isSameDay(this.getDateFromTimestamp(date1), this.getDateFromTimestamp(date2));
  }

  compareMonthTimestamp(date1: TimestampType, date2: TimestampType): boolean {
    return isSameMonth(fromUnixTime(date1.seconds), fromUnixTime(date2.seconds));
  }

  TimestampFromDate(date: Date): TimestampType {
    return Timestamp.fromDate(date);
  }
}
