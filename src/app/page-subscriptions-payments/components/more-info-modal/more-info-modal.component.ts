import { Component, Input, OnInit } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { trace } from '@angular/fire/compat/performance';
import { fromUnixTime, isSameDay } from 'date-fns';
import { combineLatest, first, map, Observable, switchMap, take, BehaviorSubject } from 'rxjs';
import { EnrollmentTypesService } from 'src/app/shared/services/enrollment-types.service';
import { EventItem } from 'src/app/shared/services/event';
import { MajorEventItem, MajorEventSubscription } from 'src/app/shared/services/major-event.service';
import { Timestamp } from '@firebase/firestore-types';

import { parse } from 'twemoji-parser';
import { DomSanitizer } from '@angular/platform-browser';
import { formatDate } from '@angular/common';
import { ModalController } from '@ionic/angular';

import { documentId } from 'firebase/firestore';

@Component({
  selector: 'app-more-info-modal',
  templateUrl: './more-info-modal.component.html',
  styleUrls: ['./more-info-modal.component.scss'],
})
export class MoreInfoModalComponent implements OnInit {
  @Input() majorEventID: string;

  majorEvent$: Observable<MajorEventItem>;

  subscribedEvents$: Observable<EventItem[]>;
  notSubscribedEvents$: Observable<EventItem[]>;

  majorEventSubscription$: Observable<MajorEventSubscription>;

  subscriptionType: Promise<number>;

  constructor(
    public afs: AngularFirestore,
    public auth: AngularFireAuth,
    public enrollmentTypes: EnrollmentTypesService,
    private sanitizer: DomSanitizer,
    private modalController: ModalController
  ) {}

  ngOnInit() {
    this.majorEvent$ = this.afs
      .doc<MajorEventItem>(`majorEvents/${this.majorEventID}`)
      .valueChanges({ idField: 'id' })
      .pipe(trace('firestore'));

    this.auth.user.pipe(first(), trace('auth')).subscribe((user) => {
      if (user) {
        const query = this.afs.doc<MajorEventSubscription>(
          `majorEvents/${this.majorEventID}/subscriptions/${user.uid}`
        );

        query
          .get()
          .pipe(trace('firestore'), take(1))
          .subscribe((document) => {
            const data = document.data() as MajorEventSubscription;
            this.subscribedEvents$ = this.afs
              .collection<EventItem>('events', (ref) =>
                ref.where(documentId(), 'in', data.subscribedToEvents).orderBy('eventStartDate')
              )
              .valueChanges({ idField: 'id' })
              .pipe(trace('firestore'), take(1));

            this.notSubscribedEvents$ = this.afs
              .collection<EventItem>('events', (ref) => ref.where(documentId(), 'not-in', data.subscribedToEvents))
              .valueChanges({ idField: 'id' })
              .pipe(trace('firestore'), take(1));

            this.subscriptionType = Promise.resolve(data.subscriptionType);
          });

        this.majorEventSubscription$ = query.valueChanges({ idField: 'id' }).pipe(trace('firestore'), take(1));
      }
    });
  }

  getEnrollmentPrice(majorEventPrice: MajorEventItem['price'], enrollmentType: Promise<number>): Promise<number> {
    return new Promise((resolve) => {
      enrollmentType.then((type) => {
        switch (type) {
          case 0:
            return resolve(majorEventPrice.students);
          case 1:
            return resolve(majorEventPrice.otherStudents);
          case 2:
            return resolve(majorEventPrice.professors);
        }
      });
    });
  }

  getDateFromTimestamp(timestamp: Timestamp): Date {
    return fromUnixTime(timestamp.seconds);
  }

  formatDate(date: Date): string {
    let formated = formatDate(date, "EEEE, dd 'de' MMMM 'de' yyyy", 'pt-BR');

    formated = formated.charAt(0).toUpperCase() + formated.slice(1);
    return formated;
  }

  dayCompare(date1: Timestamp, date2: Timestamp): boolean {
    return isSameDay(fromUnixTime(date1.seconds), fromUnixTime(date2.seconds));
  }

  getEmoji(emoji: string): any {
    if (emoji === undefined) {
      return this.sanitizer.bypassSecurityTrustResourceUrl(parse('❔')[0].url);
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(parse(emoji)[0].url);
  }

  closeModal() {
    this.modalController.dismiss();
  }
}
