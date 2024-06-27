import { Injectable } from '@angular/core';
import { compareAsc, fromUnixTime, isSameDay, isSameMonth, parseISO } from 'date-fns';
import { Timestamp } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class DateService {
  parseISO = parseISO;

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

  getDateFromTimestamp(Timestamp: Timestamp): Date {
    return fromUnixTime(Timestamp.seconds);
  }

  compareDayTimestamp(date1: Timestamp, date2: Timestamp): boolean {
    return isSameDay(this.getDateFromTimestamp(date1), this.getDateFromTimestamp(date2));
  }

  compareMonthTimestamp(date1: Timestamp, date2: Timestamp): boolean {
    return isSameMonth(fromUnixTime(date1.seconds), fromUnixTime(date2.seconds));
  }

  TimestampFromDate(date: Date): Timestamp {
    return Timestamp.fromDate(date);
  }
}
