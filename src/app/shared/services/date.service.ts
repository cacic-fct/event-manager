import { Injectable } from '@angular/core';
import { compareAsc, fromUnixTime, isSameDay, isSameMonth, parseISO } from 'date-fns';
import { Timestamp as TimestampType } from '@firebase/firestore-types';
import { Timestamp } from '@firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class DateService {
  parseISO = parseISO;
  constructor() {}

  isBetweenDates(date1: Date, date2: Date, dateToCompare: Date): boolean {
    return compareAsc(date1, dateToCompare) === -1 && compareAsc(dateToCompare, date2) === -1;
  }

  isInThePast(date: Date): boolean {
    return compareAsc(date, this.today()) === -1;
  }

  today(): Date {
    return new Date();
  }

  getDateNowWithTimezoneOffset(): Date {
    return new Date(Date.now() - this.getTimezoneOffsetInMilliseconds());
  }

  getTimezoneOffsetInMilliseconds(): number {
    return new Date().getTimezoneOffset() * 60_000;
  }

  getISOStringToIonDatetime(date: Date): string {
    return date.toISOString().slice(0, -1);
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
