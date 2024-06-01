import { MajorEventItem } from 'src/app/shared/services/major-event.service';
import { User } from '../../../../shared/services/user';
import { EventItem } from '../../../../shared/services/event';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { serverTimestamp, increment } from '@angular/fire/firestore';
import { MajorEventSubscription } from '../../../../shared/services/major-event.service';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { ActivatedRoute } from '@angular/router';
import { Component, inject } from '@angular/core';
import { Observable, map, take, combineLatest } from 'rxjs';
import { trace } from '@angular/fire/compat/performance';
import { DateService } from 'src/app/shared/services/date.service';
import { Auth, user } from '@angular/fire/auth';
import { AlertController } from '@ionic/angular/standalone';

import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonText,
  IonProgressBar,
  IonCard,
  IonButton,
  IonIcon,
  IonLabel,
} from '@ionic/angular/standalone';
import { AsyncPipe, CurrencyPipe, DatePipe } from '@angular/common';

@UntilDestroy()
@Component({
  selector: 'app-manage-subscription',
  templateUrl: './manage-subscription.page.html',
  styleUrls: ['./manage-subscription.page.scss'],
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonText,
    IonProgressBar,
    IonCard,
    IonButton,
    IonIcon,
    IonLabel,
    DatePipe,
    AsyncPipe,
    CurrencyPipe,
  ],
})
export class ManageSubscriptionPage {
  private auth: Auth = inject(Auth);
  user$ = user(this.auth);

  subscriptionID: string;
  majorEventID: string;

  subscription$: Observable<MajorEventSubscription | undefined>;

  userData$: Observable<User | undefined>;

  eventsUserIsSubscribedTo$: Observable<(EventItem | undefined)[]> | undefined;

  eventsUserAttended: string[] = [];
  eventsUserAttendedNotPaying: string[] = [];

  constructor(
    private route: ActivatedRoute,
    private afs: AngularFirestore,
    public dateService: DateService,
    private alertController: AlertController,
  ) {
    this.subscriptionID = this.route.snapshot.paramMap.get('subscriptionID');
    this.majorEventID = this.route.snapshot.paramMap.get('eventID');
    this.userData$ = this.afs.doc<User>(`users/${this.subscriptionID}`).valueChanges().pipe(untilDestroyed(this));

    this.subscription$ = this.afs
      .doc<MajorEventSubscription>(`majorEvents/${this.majorEventID}/subscriptions/${this.subscriptionID}`)
      .valueChanges()
      .pipe(untilDestroyed(this));

    this.subscription$.subscribe((data) => {
      if (!data) {
        return;
      }

      const tempArray: Observable<EventItem | undefined>[] = [];

      data.subscribedToEvents.map((event) => {
        tempArray.push(
          this.afs.doc<EventItem>(`events/${event}`).valueChanges({ idField: 'id' }).pipe(take(1), trace('firestore')),
        );
      });

      let observableArrayOfEvents = combineLatest(tempArray);

      observableArrayOfEvents = observableArrayOfEvents.pipe(
        map((events) => {
          return events.sort((a, b) => {
            if (!a || !b) {
              return 0;
            }
            return a.eventStartDate.toMillis() - b.eventStartDate.toMillis();
          });
        }),
      );

      this.eventsUserIsSubscribedTo$ = observableArrayOfEvents;
    });

    // TODO: Refactor me
    // Get all events of this major event
    this.afs
      .doc<MajorEventItem>(`majorEvents/${this.majorEventID}`)
      .get()
      .pipe(take(1))
      .subscribe((doc) => {
        const data = doc.data();

        if (!data) {
          return;
        }

        // For every event of this major event, check if user document is in the attendance collection
        data.events.forEach((event) => {
          this.afs
            .doc(`events/${event}/attendance/${this.subscriptionID}`)
            .get()
            .subscribe((doc) => {
              if (doc.exists) {
                this.eventsUserAttended.push(event);
              } else {
                this.afs
                  .doc(`events/${event}/non-paying-attendance/${this.subscriptionID}`)
                  .get()
                  .subscribe((doc) => {
                    if (doc.exists) {
                      this.eventsUserAttendedNotPaying.push(event);
                    }
                  });
              }
            });
        });
      });
  }

  forceSubscriptionEdit() {
    this.user$.subscribe((user) => {
      this.afs
        .doc<MajorEventSubscription>(`majorEvents/${this.majorEventID}/subscriptions/${this.subscriptionID}`)
        .get()
        .pipe(take(1))
        .subscribe((doc) => {
          const data = doc.data();

          if (!data || !user) {
            return;
          }

          if (data.payment.status !== 2) {
            return;
          }
          data.subscribedToEvents.forEach((event) => {
            this.afs.doc<EventItem>(`events/${event}/subscriptions/${this.subscriptionID}`).delete();
            this.afs.doc<EventItem>(`events/${event}`).update({
              // @ts-expect-error - This works
              slotsAvailable: increment(1),
              // @ts-expect-error - This works
              numberOfSubscriptions: increment(-1),
            });
          });

          this.afs.doc(`majorEvents/${this.majorEventID}/subscriptions/${this.subscriptionID}`).update({
            'payment.status': 1,
            'payment.validationAuthor': user.uid,
            'payment.validationTime': serverTimestamp(),
          });
        });
    });
  }

  // TODO: Add audit log
  deleteSubscription() {
    this.user$.subscribe((user) => {
      this.afs
        .doc<MajorEventSubscription>(`majorEvents/${this.majorEventID}/subscriptions/${this.subscriptionID}`)
        .get()
        .pipe(take(1))
        .subscribe((doc) => {
          const data = doc.data();

          if (!data || !user) {
            return;
          }

          if (data.payment.status === 2) {
            data.subscribedToEvents.forEach((event) => {
              this.afs.doc<EventItem>(`events/${event}/subscriptions/${this.subscriptionID}`).delete();
              this.afs.doc<EventItem>(`events/${event}`).update({
                // @ts-expect-error - This works
                slotsAvailable: increment(1),
                // @ts-expect-error - This works
                numberOfSubscriptions: increment(-1),
              });
            });
          }

          this.afs.doc(`users/${this.subscriptionID}/majorEventSubscriptions/${this.majorEventID}`).delete();
          this.afs.doc(`majorEvents/${this.majorEventID}/subscriptions/${this.subscriptionID}`).delete();
        });
    });
  }

  async deleteSubscriptionAlert() {
    const alert = await this.alertController.create({
      header: 'Excluir inscrição',
      message: 'Tem certeza que deseja excluir esta inscrição?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Excluir',
          handler: () => {
            this.deleteSubscription();
          },
        },
      ],
    });

    await alert.present();
  }
}
