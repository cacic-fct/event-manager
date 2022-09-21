import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Timestamp } from '@firebase/firestore-types';
import { Observable } from 'rxjs';
import { startOfDay } from 'date-fns';

// TODO como utilizar Observables para retornar os grandes eventos futuros?

@Injectable()
export class MajorEventsService {
  constructor(public afs: AngularFirestore) {}

  getFutureMajorEvents(): Observable<MajorEventItem[]> {
    const date = Date.now();
    return this.afs
      .collection<MajorEventItem>('majorEvents', (ref) => {
        let query: any = ref;
        query = query.where('eventStartDate', '>=', startOfDay(date));
        return query.orderBy('eventStartDate', 'asc');
      })
      .valueChanges({ idField: 'id' });
  }
}
export interface MajorEventItem {
  name: string;
  icon: string;
  course: string;
  dateStart: Timestamp;
  dateEnd?: Timestamp;
  subscriptionDateStart?: Timestamp;
  subscriptionDateEnd?: Timestamp;
  price: {
    priceStudents?: number;
    priceOtherStudents?: number;
    priceProfessors?: number;
    priceSingle?: number;
    isFree?: boolean;
  };
  accountChavePix?: string;
  accountBank?: string;
  accountName?: string;
  accountDocument?: string;
  accountAgency?: string;
  accountNumber?: string;
  description?: string;
  button?: {
    text?: string;
    url: string;
  };
  public: boolean;
  events: string[];
  createdBy: string;
  createdOn: Timestamp;
  id: string;
}
