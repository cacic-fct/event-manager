import { MajorEventItem } from 'src/app/shared/services/major-event.service';
import { User } from '../../../../shared/services/user';
import { EventItem } from '../../../../shared/services/event';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { serverTimestamp, increment } from '@angular/fire/firestore';
import { MajorEventSubscription } from '../../../../shared/services/major-event.service';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { ActivatedRoute, Router } from '@angular/router';
import { Component, inject } from '@angular/core';
import { Observable, map, take, combineLatest, switchMap, of, forkJoin, tap, catchError } from 'rxjs';
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
  private router: Router = inject(Router);
  user$ = user(this.auth);

  subscriptionID: string;
  majorEventID: string;

  subscription$: Observable<MajorEventSubscription | undefined>;
  userData$: Observable<User | undefined>;
  eventsUserIsSubscribedTo$: Observable<(EventItem | undefined)[]> | undefined;
  eventsUserAttended$: Observable<string[]> | undefined;
  eventsUserAttendedNotPaying$: Observable<string[]> | undefined;

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
      .pipe(
        untilDestroyed(this),
        tap((data) => {
          if (!data) {
            this.router.navigate(['../'], { relativeTo: this.route });
          }
        }),
      );

    this.eventsUserIsSubscribedTo$ = this.subscription$.pipe(
      switchMap((data) => {
        if (!data) {
          return of([]);
        }
        const eventObservables = data.subscribedToEvents.map((event) =>
          this.afs
            .doc<EventItem>(`events/${event}`)
            .valueChanges({ idField: 'id' })
            .pipe(
              take(1),
              trace('firestore'),
              catchError(() => of(undefined)),
            ),
        );
        return combineLatest(eventObservables).pipe(
          map((events) =>
            events
              .filter((event): event is EventItem => !!event)
              .sort((a, b) => a.eventStartDate.toMillis() - b.eventStartDate.toMillis()),
          ),
        );
      }),
    );

    this.eventsUserAttended$ = this.afs
      .doc<MajorEventItem>(`majorEvents/${this.majorEventID}`)
      .get()
      .pipe(
        take(1),
        switchMap((doc) => {
          const data = doc.data();
          if (!data) {
            return of([]);
          }
          const attendanceChecks = data.events.map((event) =>
            this.afs
              .doc(`events/${event}/attendance/${this.subscriptionID}`)
              .get()
              .pipe(
                take(1),
                map((doc) => (doc.exists ? event : null)),
              ),
          );
          return forkJoin(attendanceChecks).pipe(map((results) => results.filter((event): event is string => !!event)));
        }),
        untilDestroyed(this),
      );

    this.eventsUserAttendedNotPaying$ = this.afs
      .doc<MajorEventItem>(`majorEvents/${this.majorEventID}`)
      .get()
      .pipe(
        take(1),
        switchMap((doc) => {
          const data = doc.data();
          if (!data) {
            return of([]);
          }
          const nonPayingAttendanceChecks = data.events.map((event) =>
            this.afs
              .doc(`events/${event}/non-paying-attendance/${this.subscriptionID}`)
              .get()
              .pipe(
                take(1),
                map((doc) => (doc.exists ? event : null)),
              ),
          );
          return forkJoin(nonPayingAttendanceChecks).pipe(
            map((results) => results.filter((event): event is string => !!event)),
          );
        }),
        untilDestroyed(this),
      );
  }

  forceSubscriptionEdit() {
    this.user$
      .pipe(
        take(1),
        switchMap((user) =>
          this.afs
            .doc<MajorEventSubscription>(`majorEvents/${this.majorEventID}/subscriptions/${this.subscriptionID}`)
            .get()
            .pipe(
              take(1),
              map((doc) => ({ doc, user })),
            ),
        ),
        untilDestroyed(this),
      )
      .subscribe(({ doc, user }) => {
        const data = doc.data();
        if (!data || !user || data.payment.status !== 2) {
          return;
        }

        const updates = data.subscribedToEvents.map((event) =>
          this.afs
            .doc<EventItem>(`events/${event}`)
            .update({
              // @ts-expect-error - This works
              slotsAvailable: increment(1),
              // @ts-expect-error -  This works
              numberOfSubscriptions: increment(-1),
            })
            .then(() => this.afs.doc<EventItem>(`events/${event}/subscriptions/${this.subscriptionID}`).delete()),
        );

        Promise.all(updates).then(() => {
          this.afs.doc(`majorEvents/${this.majorEventID}/subscriptions/${this.subscriptionID}`).update({
            'payment.status': 1,
            'payment.validationAuthor': user.uid,
            'payment.validationTime': serverTimestamp(),
          });
        });
      });
  }

  deleteSubscription() {
    this.user$
      .pipe(
        take(1),
        switchMap((user) =>
          this.afs
            .doc<MajorEventSubscription>(`majorEvents/${this.majorEventID}/subscriptions/${this.subscriptionID}`)
            .get()
            .pipe(
              untilDestroyed(this),
              map((doc) => ({ doc, user })),
            ),
        ),
      )
      .subscribe(({ doc, user }) => {
        const data = doc.data();
        if (!data || !user) {
          return;
        }

        const updates =
          data.payment.status === 2
            ? data.subscribedToEvents.map((event) =>
                this.afs
                  .doc<EventItem>(`events/${event}`)
                  .update({
                    // @ts-expect-error - This works
                    slotsAvailable: increment(1),
                    // @ts-expect-error - This works
                    numberOfSubscriptions: increment(-1),
                  })
                  .then(() => this.afs.doc<EventItem>(`events/${event}/subscriptions/${this.subscriptionID}`).delete()),
              )
            : [];

        Promise.all(updates).then(() => {
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
