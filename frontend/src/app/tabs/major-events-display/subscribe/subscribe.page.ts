// @ts-strict-ignore
import { MajorEventSubscription } from 'src/app/shared/services/major-event.service';
import { EnrollmentTypesService } from 'src/app/shared/services/enrollment-types.service';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { ActivatedRoute, Router } from '@angular/router';
import { AsyncPipe, CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { take, Observable, switchMap, of } from 'rxjs';

import { MajorEventItem } from 'src/app/shared/services/major-event.service';
import { EventItem } from 'src/app/shared/services/event';
import { ModalController, ToastController } from '@ionic/angular/standalone';

import { ConfirmSubscriptionModalComponent } from './confirm-subscription-modal/confirm-subscription-modal.component';
import { SwalComponent, SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';

import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  Firestore,
  doc,
  docData,
  serverTimestamp,
  collection,
  collectionData,
  setDoc,
  query,
  where,
  documentId,
  orderBy,
} from '@angular/fire/firestore';
import { EmojiService } from 'src/app/shared/services/emoji.service';
import { DateService } from 'src/app/shared/services/date.service';
import { Auth, user, User as FirebaseUser } from '@angular/fire/auth';

import {
  IonHeader,
  IonCardContent,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonCardHeader,
  IonCardTitle,
  IonItem,
  IonIcon,
  IonLabel,
  IonText,
  IonItemDivider,
  IonCheckbox,
  IonProgressBar,
  IonFab,
  IonFabButton,
  IonButton,
  IonSpinner,
  IonSelect,
  IonSelectOption,
  IonList,
} from '@ionic/angular/standalone';
import { MajorEventInfoSubscriptionComponent } from 'src/app/tabs/major-events-display/subscribe/major-event-info-subscription/major-event-info-subscription.component';
import { EventListFormComponent } from 'src/app/tabs/major-events-display/subscribe/event-list-form/event-list-form.component';
import { GlobalConstantsService } from 'src/app/shared/services/global-constants.service';
import { User } from 'src/app/shared/services/user';

@UntilDestroy()
@Component({
  selector: 'app-subscribe',
  templateUrl: 'subscribe.page.html',
  styleUrls: ['subscribe.page.scss'],
  standalone: true,
  imports: [
    EventListFormComponent,
    MajorEventInfoSubscriptionComponent,
    IonHeader,
    IonCardContent,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonCardHeader,
    IonCardTitle,
    IonItem,
    IonIcon,
    IonLabel,
    IonText,
    IonItemDivider,
    IonCheckbox,
    IonProgressBar,
    IonFab,
    IonFabButton,
    IonButton,
    IonSpinner,
    IonList,
    IonSelect,
    IonSelectOption,
    ReactiveFormsModule,
    SweetAlert2Module,
    CurrencyPipe,
    AsyncPipe,
    DecimalPipe,
    DatePipe,
    FormsModule,
  ],
})
export class SubscribePage implements OnInit {
  @ViewChild('successSwal')
  private successSwal!: SwalComponent;
  @ViewChild('errorSwal')
  private errorSwal!: SwalComponent;
  @ViewChild('maxChanged')
  private maxChanged!: SwalComponent;
  @ViewChild('alreadySubscribed')
  private alreadySubscribed!: SwalComponent;
  @ViewChild('eventNotFound')
  private eventNotFound!: SwalComponent;
  @ViewChild('eventOutOfSubscriptionDate')
  private eventOutOfSubscriptionDate!: SwalComponent;

  @ViewChild('formComponent')
  private formComponent!: EventListFormComponent;

  private auth: Auth = inject(Auth);

  today: Date = new Date();

  opSelected: string | undefined = undefined;

  paymentStatus: number | undefined;

  // These are passed to the form component
  maxCourses: number | undefined;
  maxLectures: number | undefined;
  majorEvent$: Observable<MajorEventItem>;
  user$: Observable<FirebaseUser | null> = user(this.auth);
  isAlreadySubscribed: boolean | undefined;
  majorEventID: string;
  events$: Observable<EventItem[]>;
  mandatoryEvents: string[] = [];

  private firestore: Firestore = inject(Firestore);

  constructor(
    private route: ActivatedRoute,
    public afs: AngularFirestore,
    private router: Router,
    private modalController: ModalController,
    private toastController: ToastController,
    public enrollmentTypes: EnrollmentTypesService,

    public emojiService: EmojiService,
    public dateService: DateService,
  ) {
    this.majorEventID = this.route.snapshot.params['eventID'];

    this.user$
      .pipe(
        take(1),
        switchMap((user) => {
          if (user) {
            const subscriptionDocRef = doc(
              this.firestore,
              `majorEvents/${this.majorEventID}/subscriptions/${user.uid}`,
            );
            return docData(subscriptionDocRef) as Observable<MajorEventSubscription>;
          } else {
            return of(null);
          }
        }),
      )
      .subscribe((subscription) => {
        if (subscription) {
          this.isAlreadySubscribed = true;
        }
      });

    const majorEventCol = collection(this.firestore, 'majorEvents');
    this.majorEvent$ = docData(doc(majorEventCol, this.majorEventID), { idField: 'id' }) as Observable<MajorEventItem>;

    this.events$ = this.majorEvent$.pipe(
      switchMap((majorEvent) => {
        if (!majorEvent) {
          return of([]);
        }

        if (majorEvent.mandatoryEvents) {
          this.mandatoryEvents = majorEvent.mandatoryEvents;
        }

        const eventsCollection = collection(this.firestore, `events`);
        const eventsCollection$ = collectionData(
          query(eventsCollection, where(documentId(), 'in', majorEvent.events), orderBy('eventStartDate')),
          {
            idField: 'id',
          },
        ) as Observable<EventItem[]>;

        return eventsCollection$;
      }),
    );
  }

  ngOnInit() {
    this.user$.pipe(take(1)).subscribe((user) => {
      if (user) {
        this.afs
          .collection('users')
          .doc<User>(user.uid)
          .get()
          .pipe(take(1))
          .subscribe((doc) => {
            // TODO: Transformar isso em um guard(?)
            if (doc.exists) {
              if (doc.data()?.dataVersion !== GlobalConstantsService.userDataVersion) {
                console.debug("DEBUG: SubscribePage: User's data is outdated, redirecting to update page");
                this.router.navigate(['/ajustes/conta/informacoes-pessoais']);
              }
            } else {
              console.debug("DEBUG: SubscribePage: User's data doesn't exist, redirecting to update page");
              this.router.navigate(['/ajustes/conta/informacoes-pessoais']);
            }
          });
      }
    });

    this.afs
      .collection('majorEvents')
      .doc(this.majorEventID)
      .get()
      .pipe(untilDestroyed(this))
      .subscribe((document) => {
        // If majorEventID is not valid, redirect
        if (!document.exists) {
          this.eventNotFound.fire();
          setTimeout(() => {
            this.router.navigate(['eventos']);
            this.eventNotFound.close();
          }, 1000);
        } else {
          // If majorEventID is valid, check if subscriptions are open
          const majorEvent = document.data() as MajorEventItem;
          if (this.dateService.getDateFromTimestamp(majorEvent.eventEndDate) < this.today) {
            this.router.navigate(['eventos']);

            this.eventOutOfSubscriptionDate.fire();
            setTimeout(() => {
              this.router.navigate(['eventos']);
              this.eventOutOfSubscriptionDate.close();
            }, 1000);
          }
        }
      });

    // Check if user has receipt validated
    // If they have, they can't edit their subscription
    this.user$.pipe(take(1)).subscribe((user) => {
      if (user) {
        const subscriptionDocRef = doc(this.firestore, `majorEvents/${this.majorEventID}/subscriptions/${user.uid}`);

        docData(subscriptionDocRef)
          .pipe(take(1))
          .subscribe((subscription) => {
            if (subscription) {
              if (subscription['payment'].status === 2) {
                this.router.navigate(['/eventos'], { replaceUrl: true });

                this.alreadySubscribed.fire();
                setTimeout(() => {
                  this.alreadySubscribed.close();
                }, 1000);
              } else {
                this.paymentStatus = subscription['payment'].status;

                if (subscription['subscriptionType']) {
                  this.opSelected = subscription['subscriptionType'].toString();
                }
              }
            }
          });
      }
    });

    this.majorEvent$.pipe(untilDestroyed(this)).subscribe((majorEvent) => {
      if (this.maxCourses && this.maxCourses !== majorEvent.maxCourses) {
        this.maxChanged.fire();
        this.router.navigateByUrl('/eventos/inscricao', { skipLocationChange: true }).then(() => {
          this.router.navigate([`/eventos/inscricao/${this.majorEventID}`]);
        });
      }

      if (this.maxLectures && this.maxLectures !== majorEvent.maxLectures) {
        this.maxChanged.fire();
        this.router.navigateByUrl('/eventos/inscricao', { skipLocationChange: true }).then(() => {
          this.router.navigate([`/eventos/inscricao/${this.majorEventID}`]);
        });
      }

      this.maxCourses = majorEvent.maxCourses;
      this.maxLectures = majorEvent.maxLectures;
    });
  }

  async presentSelectSubscriptionToast() {
    const toast = await this.toastController.create({
      header: `Selecione o tipo de inscrição`,
      message: `No início da página, logo abaixo das informações do evento.`,
      icon: 'alert-circle-outline',
      position: 'bottom',
      duration: 5000,
      buttons: [
        {
          side: 'end',
          text: 'OK',
          role: 'cancel',
        },
      ],
    });

    toast.present();
  }

  onSubmit() {
    const dataForm = this.formComponent.dataForm;

    const eventsSelected: string[] = Object.keys(dataForm.value).filter((key) => dataForm.value[key]);
    const amountOfEventsSelected = eventsSelected.length;

    if (amountOfEventsSelected === 0) {
      return;
    }

    this.majorEvent$.pipe(take(1)).subscribe((majorEvent) => {
      this.openConfirmModal(eventsSelected).then((response) => {
        if (!response) {
          return;
        }

        let price: number | undefined;

        if (majorEvent.price.single) {
          this.opSelected = 'single';
        } else {
          if (this.opSelected === undefined) {
            this.presentSelectSubscriptionToast();
            return;
          }
        }

        console.log('DEBUG: SubscribePage: Subscription type selected:', this.opSelected);

        switch (this.opSelected) {
          case '0':
            price = majorEvent.price.students;
            break;
          case '1':
            price = majorEvent.price.otherStudents;
            break;
          case '2':
            price = majorEvent.price.professors;
            break;
          case 'single':
            price = majorEvent.price.single;
            break;
          default:
            return;
        }

        if (price === undefined) {
          console.debug('DEBUG: SubscribePage: Price is undefined');
          return;
        }

        let subscriptionType: number | null = Number.parseInt(this.opSelected);

        if (Number.isNaN(subscriptionType)) {
          subscriptionType = null;
        }

        this.user$.pipe(take(1)).subscribe((user) => {
          if (!user) {
            console.debug('DEBUG: SubscribePage: User is undefined');
            return;
          }

          const majorEventUserSubscriptionDocRef = doc(
            this.firestore,
            `majorEvents/${this.majorEventID}/subscriptions/${user.uid}`,
          );

          const userData$ = docData(majorEventUserSubscriptionDocRef, {
            idField: 'id',
          }) as Observable<MajorEventSubscription>;

          userData$.pipe(take(1)).subscribe(async (userSubscription) => {
            let paymentStatusLocal: number | null = 0;
            if (userSubscription) {
              console.debug('DEBUG: SubscribePage: User is already subscribed');
              paymentStatusLocal = this.setPaymentStatus(userSubscription.payment.status);

              // If user already had payment validated, don't allow them to change subscription
              if (paymentStatusLocal === 2) {
                console.debug(
                  'DEBUG: SubscribePage: Payment status is "validated", don\'t allow user to change subscription',
                );
                return;
              }
            }

            try {
              console.debug('DEBUG: SubscribePage: Writing subscription data');

              await setDoc(majorEventUserSubscriptionDocRef, {
                subscribedToEvents: eventsSelected,
                subscriptionType: subscriptionType,
                time: serverTimestamp(),
                payment: {
                  price: price,
                  status: paymentStatusLocal,
                  time: serverTimestamp(),
                  author: user.uid,
                  validationTime: null,
                  validationAuthor: null,
                },
              } as MajorEventSubscription).then(async () => {
                console.debug('DEBUG: SubscribePage: Subscription data written');

                const userSubscriptionDocRef = doc(
                  this.firestore,
                  `users/${user.uid}/majorEventSubscriptions/${this.majorEventID}`,
                );

                console.debug('DEBUG: SubscribePage: Writing user subscription data');
                await setDoc(userSubscriptionDocRef, {
                  reference: majorEventUserSubscriptionDocRef,
                }).then(() => {
                  console.debug('DEBUG: SubscribePage: User subscription data written');
                  this.successSwal.fire();
                  setTimeout(() => {
                    this.successSwal.close();
                    if (
                      this.paymentStatus === 1 ||
                      this.paymentStatus === 4 ||
                      this.paymentStatus === 5 ||
                      price === 0
                    ) {
                      this.router.navigate(['/inscricoes'], { replaceUrl: true });
                    } else {
                      this.router.navigate(['/inscricoes/pagar', this.majorEventID], {
                        replaceUrl: true,
                      });
                    }
                  }, 2000);
                });
              });
            } catch (err) {
              console.log(err);
            }
          });
        });
      });
    });
  }

  /**
   *
   * @param status
   * @returns Updated status
   */
  setPaymentStatus(status: number): number | null {
    let updatedStatus: number | null = status;
    if (this.paymentStatus !== undefined) {
      switch (this.paymentStatus) {
        case 4:
        case 5:
          // If user has already paid,
          // but subscription was denied due to insufficient slots or schedule conflict,
          // set status to "pending verification"
          updatedStatus = 1;
          break;
        case null:
          updatedStatus = null;
          break;

        // If status === 1, 3, keep status as is
      }
    }

    return updatedStatus;
  }

  async openConfirmModal(eventsSelected: string[]): Promise<boolean> {
    const modal = await this.modalController.create({
      component: ConfirmSubscriptionModalComponent,
      componentProps: {
        majorEvent$: this.majorEvent$,
        eventsSelected: eventsSelected,
        minicursosCount: this.formComponent.amountOfCoursesSelected,
        palestrasCount: this.formComponent.amountOfLecturesSelected,
        subscriptionType: this.opSelected,
        events$: this.events$,
      },
      showBackdrop: true,
    });
    await modal.present();

    return modal.onDidDismiss().then((data) => {
      console.debug('DEBUG: SubscribePage: Modal dismissed with data:', data);
      if (data.data) {
        return new Promise<boolean>((resolve) => {
          resolve(true);
        });
      }
      return new Promise<boolean>((resolve) => {
        resolve(false);
      });
    });
  }

  async processingToast() {
    const toast = await this.toastController.create({
      message: 'Processando...',
      duration: 1000,
      position: 'bottom',
      icon: 'hourglass-outline',
      buttons: [
        {
          text: 'OK',
          role: 'cancel',
        },
      ],
    });
    toast.present();
  }
}
