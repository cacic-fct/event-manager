import { EventItem, EventSubscription } from 'src/app/shared/services/event';
import { MajorEventItem, MajorEventSubscription } from '../../shared/services/major-event.service';
import { Component, inject } from '@angular/core';
import { map, Observable, switchMap, combineLatest, shareReplay, catchError } from 'rxjs';

import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  DocumentReference,
  Timestamp,
} from '@angular/fire/firestore';

import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { EnrollmentTypesService } from '../../shared/services/enrollment-types.service';
import { DateService } from 'src/app/shared/services/date.service';
import { Auth, user } from '@angular/fire/auth';
import { CurrencyPipe, DatePipe, AsyncPipe, NgTemplateOutlet, DOCUMENT } from '@angular/common';

import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonIcon,
  IonContent,
  IonList,
  IonGrid,
  IonRow,
  IonCol,
  IonProgressBar,
  IonButton,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonCardSubtitle,
  IonCard,
  IonText,
  IonSpinner,
  IonRouterLink,
  AlertController,
  AlertInput,
} from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { EventCardDisplayMainPageComponent } from 'src/app/profile/my-attendances/components/event-card-display-main-page/event-card-display-main-page.component';
import { Mailto, MailtoService } from 'src/app/shared/services/mailto.service';

@UntilDestroy()
@Component({
  selector: 'app-subscribe',
  templateUrl: './my-attendances.page.html',
  styleUrls: ['./my-attendances.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonRouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonList,
    IonProgressBar,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonCardSubtitle,
    IonCard,
    IonGrid,
    IonRow,
    IonCol,
    IonButton,
    IonIcon,
    IonText,
    IonSpinner,
    CurrencyPipe,
    DatePipe,
    AsyncPipe,
    EventCardDisplayMainPageComponent,
    NgTemplateOutlet,
  ],
})
export class MyAttendancesPage {
  private document = inject(DOCUMENT);
  private auth: Auth = inject(Auth);
  private alertController: AlertController = inject(AlertController);
  private mailtoService: MailtoService = inject(MailtoService);
  user$ = user(this.auth).pipe(shareReplay(1), untilDestroyed(this));

  private firestore: Firestore = inject(Firestore);

  subscriptions$: Observable<Subscription[]>;
  eventSubscriptions$: Observable<EventSubscriptionLocal[]>;

  today: Date = new Date();

  constructor(
    public enrollmentTypes: EnrollmentTypesService,
    public dateService: DateService,
  ) {
    this.subscriptions$ = this.user$.pipe(
      switchMap((user) => {
        if (!user) {
          return [];
        }

        const subscriptionCol = collection(this.firestore, `users/${user.uid}/majorEventSubscriptions`);
        return collectionData(subscriptionCol, { idField: 'id' }).pipe(
          map((subscriptions) => {
            return subscriptions.map((subscription) => {
              return {
                id: subscription.id,
                userData: docData(
                  doc(this.firestore, `majorEvents/${subscription.id}/subscriptions/${user.uid}`),
                ) as Observable<MajorEventSubscription>,
                majorEvent: docData(doc(this.firestore, `majorEvents/${subscription.id}`), {
                  idField: 'id',
                }) as Observable<MajorEventItem>,
              };
            });
          }),
        );
      }),
    );

    this.eventSubscriptions$ = this.user$.pipe(
      switchMap((user) => {
        if (!user) {
          return [];
        }
        const eventsCol = collection(this.firestore, `users/${user.uid}/eventSubscriptions`);
        return collectionData(eventsCol, { idField: 'id' }).pipe(
          switchMap((subscriptions) => {
            if (subscriptions.length === 0) {
              return [];
            }

            const arrayOfEvents: Observable<EventItem>[] = subscriptions.map((subscription) => {
              return docData(doc(this.firestore, `events/${subscription.id}`)) as Observable<EventItem>;
            });

            return combineLatest(arrayOfEvents).pipe(
              map((events) => {
                return events.sort((a, b) => a.eventStartDate.seconds - b.eventStartDate.seconds);
              }),
              switchMap((sortedEvents) => {
                const eventsWithUserData = sortedEvents.map((event) => {
                  return docData(doc(this.firestore, `events/${event.id}/subscriptions/${user.uid}`)).pipe(
                    map((userData) => ({
                      id: event.id,
                      event: event,
                      userData: userData as EventSubscription,
                    })),
                  );
                });

                return combineLatest(eventsWithUserData).pipe(
                  map((eventsWithUserData) => {
                    return eventsWithUserData;
                  }),
                );
              }),
            );
          }),
          catchError((error) => {
            console.error('Error fetching data:', error);
            return [];
          }),
        );
      }),
    );
  }

  isInSubscriptionPeriod(endDateTimestamp: Timestamp): boolean {
    if (endDateTimestamp) {
      const endDate = this.dateService.getDateFromTimestamp(endDateTimestamp);
      return this.today < endDate;
    }
    return false;
  }

  isPastEvent(endDateTimestamp: Timestamp): boolean {
    if (endDateTimestamp) {
      const endDate = this.dateService.getDateFromTimestamp(endDateTimestamp);
      return this.today > endDate;
    }
    return false;
  }

  getCardType(majorEvent: MajorEventItem, subscription: MajorEventSubscription): number {
    const eventEndDate = this.dateService.getDateFromTimestamp(majorEvent.eventEndDate);
    if (this.today > eventEndDate && subscription.payment.status === 2) return -1;
    return subscription.payment.status;
  }

  contactOrganizer(majorEvent: MajorEventItem): void {
    const contactInfo = majorEvent.contactInfo;
    if (!contactInfo) {
      return;
    }
    const email = contactInfo.email;
    const phone = contactInfo.phone;
    const whatsapp = contactInfo.whatsapp;

    // Count the number of non-empty contact methods
    const contactMethods = [email, phone, whatsapp];
    const availableContactMethods = contactMethods.filter(
      (method) => method !== undefined && method !== null && method !== '',
    ).length;

    // Check if only one contact method is available
    if (availableContactMethods === 1) {
      if (email) {
        this.contactChooser('email', majorEvent);
      } else if (phone) {
        this.contactChooser('phone', majorEvent);
      } else if (whatsapp) {
        this.contactChooser('whatsapp', majorEvent);
      }
    } else {
      const alertInputs: AlertInput[] = [];

      if (email) {
        alertInputs.push({
          type: 'radio',
          label: 'E-mail',
          value: 'email',
        });
      }

      if (phone) {
        alertInputs.push({
          type: 'radio',
          label: 'Ligação telefônica',
          value: 'phone',
        });
      }

      if (whatsapp) {
        alertInputs.push({
          type: 'radio',
          label: 'WhatsApp',
          value: 'whatsapp',
        });
      }

      this.alertController
        .create({
          header: 'Contatar organizadores',
          message: 'Selecione o método de contato',
          inputs: alertInputs,
          buttons: [
            {
              text: 'Ok',
              handler: (input) => {
                this.contactChooser(input, majorEvent);

                return;
              },
            },
          ],
        })
        .then((alert) => alert.present());
    }
  }

  contactChooser(method: 'email' | 'phone' | 'whatsapp', majorEvent: MajorEventItem): void {
    switch (method) {
      case 'email':
        this.contactThroughEmail(majorEvent);
        break;
      case 'phone':
        this.document.location.href = `tel:${majorEvent.contactInfo!.phone}`;
        break;
      case 'whatsapp':
        this.document.location.href = `https://wa.me/${majorEvent.contactInfo!.whatsapp}`;
        break;
    }
  }

  contactThroughEmail(majorEvent: MajorEventItem) {
    const mailto: Mailto = {
      receiver: majorEvent.contactInfo!.email,
      subject: `[${majorEvent.name}] Contato sobre o evento`,
    };
    this.mailtoService.open(mailto);
  }
}

interface Subscription {
  id?: string;
  reference?: DocumentReference<MajorEventSubscription>;
  userData?: Observable<MajorEventSubscription>;
  majorEvent?: Observable<MajorEventItem>;
}

export interface EventSubscriptionLocal {
  id?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reference?: DocumentReference<any>;
  userData?: EventSubscription;
  event?: EventItem;
}
