import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Timestamp } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { startOfDay } from 'date-fns';

// TODO como utilizar Observables para retornar os grandes eventos futuros?

@Injectable({
  providedIn: 'root',
})
export class MajorEventsService {
  constructor(public afs: AngularFirestore) {}

  getFutureMajorEvents(): Observable<MajorEventItem[]> {
    const date = Date.now();
    return this.afs
      .collection<MajorEventItem>('majorEvents', (ref) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any = ref;
        query = query.where('eventStartDate', '>=', startOfDay(date));
        return query.orderBy('eventStartDate', 'asc');
      })
      .valueChanges({ idField: 'id' });
  }

  getCurrentAndFutureMajorEvents(): Observable<MajorEventItem[]> {
    const date = Date.now();
    return this.afs
      .collection<MajorEventItem>('majorEvents', (ref) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any = ref;
        query = query.where('eventEndDate', '>=', startOfDay(date));
        // TODO: Order by eventStartDate
        return query.orderBy('eventEndDate', 'asc');
        return query;
      })
      .valueChanges({ idField: 'id' });
  }
}

export interface MajorEventItem {
  name: string;
  course: string;
  description?: string;
  eventStartDate: Timestamp;
  eventEndDate: Timestamp;
  subscriptionStartDate?: Timestamp;
  subscriptionEndDate?: Timestamp;
  maxCourses?: number;
  maxLectures?: number;
  price: {
    students?: number;
    otherStudents?: number;
    professors?: number;
    single?: number;
    isFree?: boolean;
  };
  paymentInfo?: {
    chavePix?: string;
    bankName?: string;
    name?: string;
    document?: string;
    agency?: string;
    accountNumber?: string;
    additionalPaymentInformation?: string;
  } | null;
  button?: {
    text?: string;
    url: string;
  } | null;
  public: boolean;
  createdBy: string;
  createdOn: Timestamp;
  events: string[];
  mandatoryEvents?: string[];
  id?: string;
}

export interface MajorEventSubscription {
  time: Timestamp;
  payment: {
    status: number;
    time: Timestamp;
    error?: string;
    price?: number;
    author: string;
    validationTime: Timestamp | null;
    validationAuthor: string | null;
  };
  subscriptionType: number;
  subscribedToEvents: string[];
  id?: string;
}
