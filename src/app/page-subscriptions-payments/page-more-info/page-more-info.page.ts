import { ListCertificatesComponent } from './../components/list-certificates/list-certificates.component';
import { ModalController } from '@ionic/angular';
// @ts-strict-ignore
import { Component, OnInit } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { trace } from '@angular/fire/compat/performance';
import { Observable, take, combineLatest, map } from 'rxjs';
import { EnrollmentTypesService } from 'src/app/shared/services/enrollment-types.service';
import { EventItem } from 'src/app/shared/services/event';
import { MajorEventItem, MajorEventSubscription } from 'src/app/shared/services/major-event.service';

import { formatDate } from '@angular/common';

import { documentId } from 'firebase/firestore';
import { ActivatedRoute } from '@angular/router';

import { DateService } from 'src/app/shared/services/date.service';

@Component({
  selector: 'app-page-more-info',
  templateUrl: './page-more-info.page.html',
  styleUrls: ['./page-more-info.page.scss'],
})
export class PageMoreInfoPage implements OnInit {
  majorEventID: string;

  majorEvent$: Observable<MajorEventItem>;

  subscribedEvents$: Observable<EventItem[]>;
  notSubscribedEvents$: Observable<EventItem[]>;

  majorEventSubscription$: Observable<MajorEventSubscription>;

  subscriptionType: Promise<number>;

  constructor(
    public afs: AngularFirestore,
    public auth: AngularFireAuth,
    public enrollmentTypes: EnrollmentTypesService,
    private route: ActivatedRoute,
    public dateService: DateService,
    private modalController: ModalController
  ) {}

  ngOnInit() {
    // TODO: If event or subscription doesn't exist, redirect

    this.majorEventID = this.route.snapshot.paramMap.get('majorEventID');
    this.majorEvent$ = this.afs
      .doc<MajorEventItem>(`majorEvents/${this.majorEventID}`)
      .valueChanges({ idField: 'id' })
      .pipe(trace('firestore'));

    this.auth.user.pipe(take(1), trace('auth')).subscribe((user) => {
      if (user) {
        const query = this.afs.doc<MajorEventSubscription>(
          `majorEvents/${this.majorEventID}/subscriptions/${user.uid}`
        );

        query
          .get()
          .pipe(trace('firestore'), take(1))
          .subscribe((document) => {
            const data = document.data() as MajorEventSubscription;
            const subscribedEventsObservables: Array<Observable<EventItem[]>> = [];
            for (let i = 0; i < data.subscribedToEvents.length; i += 10) {
              subscribedEventsObservables.push(
                this.afs
                  .collection<EventItem>('events', (ref) =>
                    ref.where(documentId(), 'in', data.subscribedToEvents.slice(i, i + 10))
                  )
                  .valueChanges({ idField: 'id' })
                  .pipe(trace('firestore'), take(1))
              );
            }

            this.subscribedEvents$ = combineLatest(subscribedEventsObservables).pipe(
              map((events) => {
                const data = events.flat();
                return data.sort((a, b) => a.eventStartDate.seconds - b.eventStartDate.seconds);
              })
            );

            const notSubscribedEventsObservables: Array<Observable<EventItem[]>> = [];
            for (let i = 0; i < data.subscribedToEvents.length; i += 10) {
              notSubscribedEventsObservables.push(
                this.afs
                  .collection<EventItem>('events', (ref) =>
                    ref
                      .where(documentId(), 'not-in', data.subscribedToEvents.slice(i, i + 10))
                      .where('inMajorEvent', '==', this.majorEventID)
                  )
                  .valueChanges({ idField: 'id' })
                  .pipe(trace('firestore'), take(1))
              );
            }

            this.notSubscribedEvents$ = combineLatest(notSubscribedEventsObservables).pipe(
              map((events) => {
                const data = events.flat();
                return data.sort((a, b) => a.eventStartDate.seconds - b.eventStartDate.seconds);
              })
            );
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

  formatDate(date: Date): string {
    let formated = formatDate(date, "EEEE, dd 'de' MMMM 'de' yyyy", 'pt-BR');

    formated = formated.charAt(0).toUpperCase() + formated.slice(1);
    return formated;
  }

  async getCertificateList() {
    const modal = await this.modalController.create({
      component: ListCertificatesComponent,
      componentProps: {
        majorEventID: this.majorEventID,
      },
      showBackdrop: true,
    });
    await modal.present();
  }
}
