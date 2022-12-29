// @ts-strict-ignore
import { GlobalConstantsService } from './../shared/services/global-constants.service';
import { User } from './../shared/services/user';
import { InfoModalComponent } from './info-modal/info-modal.component';
import { MajorEventSubscription } from '../shared/services/major-event.service';
import { EnrollmentTypesService } from './../shared/services/enrollment-types.service';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Component, OnInit, ViewChild } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore, DocumentReference } from '@angular/fire/compat/firestore';
import { ActivatedRoute, Router } from '@angular/router';
import { formatDate } from '@angular/common';
import { compareAsc } from 'date-fns';
import { take, map, Observable } from 'rxjs';

import { MajorEventItem } from '../shared/services/major-event.service';
import { EventItem } from '../shared/services/event';
import { ModalController, ToastController } from '@ionic/angular';

import { ConfirmModalComponent } from './confirm-modal/confirm-modal.component';
import { SwalComponent } from '@sweetalert2/ngx-sweetalert2';
import { trace } from '@angular/fire/compat/performance';

import { FormBuilder, FormGroup } from '@angular/forms';
import { serverTimestamp } from '@angular/fire/firestore';
import { EmojiService } from './../shared/services/emoji.service';
import { DateService } from 'src/app/shared/services/date.service';

@UntilDestroy()
@Component({
  selector: 'app-page-subscription',
  templateUrl: 'page-subscription.page.html',
  styleUrls: ['page-subscription.page.scss'],
})
export class PageSubscriptionPage implements OnInit {
  @ViewChild('successSwal')
  private successSwal: SwalComponent;
  @ViewChild('errorSwal')
  private errorSwal: SwalComponent;
  @ViewChild('maxChanged')
  private maxChanged: SwalComponent;
  @ViewChild('alreadySubscribed')
  private alreadySubscribed: SwalComponent;
  @ViewChild('eventNotFound')
  private eventNotFound: SwalComponent;
  @ViewChild('eventOutOfSubscriptionDate')
  private eventOutOfSubscriptionDate: SwalComponent;

  today: Date = new Date();

  majorEvent$: Observable<MajorEventItem>;
  events$: Observable<EventItem[]>;

  maxCourses: number;
  maxLectures: number;

  dataForm: FormGroup;

  groupInSelection: boolean = false;

  eventsSelected: { [key: string]: EventItem[] } = {
    minicurso: [],
    palestra: [],
  };

  eventGroupMinicursoCount: number = 0;

  opSelected: string;

  paymentStatus: number;

  majorEventID = this.route.snapshot.params.eventID;

  eventSchedule: EventItem[] = [];
  isEventScheduleBeingChecked: boolean = false;

  constructor(
    public afs: AngularFirestore,
    public auth: AngularFireAuth,
    private router: Router,
    private route: ActivatedRoute,
    private modalController: ModalController,
    private toastController: ToastController,
    public enrollmentTypes: EnrollmentTypesService,
    private formBuilder: FormBuilder,
    public emojiService: EmojiService,
    public dateService: DateService
  ) {}

  ngOnInit() {
    this.auth.user.pipe(take(1)).subscribe((user) => {
      if (user) {
        this.afs
          .collection('users')
          .doc<User>(user.uid)
          .get()
          .pipe(take(1))
          .subscribe((doc) => {
            if (doc.exists) {
              if (doc.data().dataVersion !== GlobalConstantsService.userDataVersion) {
                this.router.navigate(['/register']);
              }
            } else {
              this.router.navigate(['/register']);
            }
          });
      }
    });

    this.afs
      .collection('majorEvents')
      .doc(this.majorEventID)
      .get()
      .pipe(untilDestroyed(this), trace('firestore'))
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
    this.auth.user.pipe(take(1), trace('auth')).subscribe((user) => {
      if (user) {
        this.afs
          .doc<MajorEventSubscription>(`majorEvents/${this.majorEventID}/subscriptions/${user.uid}`)
          .valueChanges({ idField: 'id' })
          .pipe(take(1), trace('firestore'))
          .subscribe((subscription) => {
            if (subscription?.payment) {
              if (subscription.payment.status === 2) {
                this.alreadySubscribed.fire();
                this.router.navigate(['/eventos'], { replaceUrl: true });

                setTimeout(() => {
                  this.alreadySubscribed.close();
                }, 1000);
              } else {
                this.paymentStatus = subscription.payment.status;

                if (subscription.subscriptionType) {
                  this.opSelected = subscription.subscriptionType.toString();
                }
              }
            }
          });
      }
    });

    this.dataForm = this.formBuilder.group({});

    this.majorEvent$ = this.afs
      .doc<MajorEventItem>(`majorEvents/${this.majorEventID}`)
      .valueChanges({ idField: 'id' })
      .pipe(trace('firestore'));

    this.events$ = this.afs
      .collection<EventItem>(`events`, (ref) =>
        ref.where('inMajorEvent', '==', this.majorEventID).orderBy('eventStartDate', 'asc')
      )
      .valueChanges({ idField: 'id' })
      .pipe(
        map((events: EventItem[]) => {
          return events.map((eventItem) => {
            this.eventSchedule.push(eventItem);

            // If there are no slots available, add event to form with disabled selection
            if (
              eventItem.slotsAvailable <= 0 ||
              this.dateService.getDateFromTimestamp(eventItem.eventStartDate) < this.today
            ) {
              this.dataForm.addControl(eventItem.id, this.formBuilder.control({ value: null, disabled: true }));
            } else {
              this.dataForm.addControl(eventItem.id, this.formBuilder.control(null));
            }

            // If user is already subscribed, auto select event
            this.auth.user.pipe(take(1), trace('auth')).subscribe((user) => {
              if (user) {
                this.afs
                  .doc(`majorEvents/${this.majorEventID}/subscriptions/${user.uid}`)
                  .get()
                  .subscribe((document) => {
                    // TODO: Remove me. This is for secompp22 only
                    if (eventItem.eventType === 'palestra') {
                      this.dataForm.get(eventItem.id).setValue(true);
                      this.dataForm.get(eventItem.id).disable();
                    }
                    ///

                    if (document.exists) {
                      const subscription = document.data() as MajorEventSubscription;
                      if (subscription.subscribedToEvents.includes(eventItem.id) && eventItem.slotsAvailable > 0) {
                        this.dataForm.get(eventItem.id).setValue(true);
                      } else {
                        this.dataForm.get(eventItem.id).setValue(false);
                      }
                    }
                  });
              }
            });

            return eventItem;
          });
        })
      );

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

  countCheckeds(e: any, event: EventItem) {
    const checked: boolean = e.currentTarget.checked;
    const name: string = e.currentTarget.name;

    if (checked) {
      if (event.slotsAvailable <= 0) {
        this.dataForm.get(event.id).setValue(false);
        this.dataForm.get(event.id).disable();
        return;
      }

      switch (name) {
        case 'minicurso':
          if (this.eventsSelected['minicurso'].length - this.eventGroupMinicursoCount < this.maxCourses) {
            this.eventsSelected['minicurso'].push(event);
          } else {
            this.dataForm.get(event.id).setValue(false);
            this.presentLimitReachedToast('minicursos', this.maxCourses.toString());
            return;
          }

          if (!this.groupInSelection && event.eventGroup.groupEventIDs) {
            this.groupInSelection = true;
            event.eventGroup.groupEventIDs.forEach((eventFromGroup) => {
              if (eventFromGroup === event.id) {
                return;
              }

              this.eventGroupMinicursoCount++;
              this.dataForm.get(eventFromGroup).setValue(true);
            });
            this.groupInSelection = false;
          }

          return;

        case 'palestra':
          if (this.eventsSelected['palestra'].length < this.maxLectures) {
            this.eventsSelected['palestra'].push(event);
          } else {
            this.dataForm.get(event.id).setValue(false);
            this.presentLimitReachedToast('palestras', this.maxLectures.toString());
          }
          return;

        default:
          if (!(name in this.eventsSelected)) {
            this.eventsSelected[name] = [];
          }

          this.eventsSelected[name].push(event);
          return;
      }
    } else {
      if (this.eventsSelected[name].some((e) => e.id === event.id)) {
        switch (name) {
          case 'minicurso':
            this.eventsSelected['minicurso'] = this.eventsSelected['minicurso'].filter((e) => e.id !== event.id);

            if (!this.groupInSelection && event.eventGroup.groupEventIDs) {
              this.groupInSelection = true;
              event.eventGroup.groupEventIDs.forEach((eventFromGroup) => {
                if (eventFromGroup === event.id) {
                  return;
                }

                this.eventGroupMinicursoCount--;
                this.dataForm.get(eventFromGroup).setValue(false);
              });
              this.groupInSelection = false;
            }
            return;

          default:
            this.eventsSelected[name] = this.eventsSelected[name].filter((e) => e.id !== event.id);
            return;
        }
      }
    }
  }

  async presentLimitReachedToast(type: string, max: string) {
    const toast = await this.toastController.create({
      header: `Limite atingido`,
      message: `Você pode escolher até ${max} ${type}`,
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

  formatDate(date: Date): string {
    let formated = formatDate(date, "EEEE, dd 'de' MMMM 'de' yyyy", 'pt-BR');

    formated = formated.charAt(0).toUpperCase() + formated.slice(1);
    return formated;
  }

  goToConfirmSubscription() {
    this.router.navigateByUrl('/eventos/confirmar-inscricao', {
      state: {
        eventsSelected: this.eventsSelected,
        majorEvent: this.majorEvent$,
      },
    });
  }

  onSubmit() {
    if (this.eventsSelected['minicurso'].length + this.eventsSelected['palestra'].length === 0) {
      return;
    }

    this.openConfirmModal().then((response) => {
      if (!response) {
        return;
      }

      this.majorEvent$.pipe(take(1)).subscribe((majorEvent) => {
        let price;
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
          default:
            price = majorEvent.price.single;
            break;
        }

        this.auth.user.pipe(take(1)).subscribe((user) => {
          if (user) {
            this.afs
              .doc<Subscription>(`users/${user.uid}/majorEventSubscriptions/${this.majorEventID}`)
              .valueChanges({ idField: 'id' })
              .pipe(take(1), trace('firestore'))
              .subscribe((subscription) => {
                if (this.paymentStatus !== 2) {
                  // Merge eventsSelected arrays
                  const eventsSelected = Object.values(this.eventsSelected).reduce((acc, val) => acc.concat(val), []);

                  // Create array with event IDs from eventsSelected
                  const eventsSelectedID = eventsSelected.map((event) => event.id);

                  let status: number = 0;

                  if (this.paymentStatus !== undefined) {
                    switch (this.paymentStatus) {
                      case 1:
                        // User already sent payment proof, keep status as "pending verification"
                        status = 1;
                        break;
                      case 3:
                        // User had payment proof denied, keep status as "pending resending proof"
                        status = 3;
                        break;
                      case 4:
                      case 5:
                        // If user has already paid,
                        // but subscription was denied due to insufficient slots or schedule conflict,
                        // set status to "pending verification"
                        status = 1;
                        break;
                      case null:
                        status = null;
                        break;
                      default:
                        status = 0;
                        break;
                    }
                  }

                  let subscriptionType: number = Number.parseInt(this.opSelected);

                  if (isNaN(subscriptionType)) {
                    subscriptionType = null;
                  }

                  this.afs
                    .collection(`majorEvents/${this.majorEventID}/subscriptions`)
                    .doc<MajorEventSubscription>(user.uid)
                    .get()
                    .subscribe((doc) => {
                      if (status === 0) {
                        this.afs
                          .collection(`majorEvents/${this.majorEventID}/subscriptions`)
                          .doc<MajorEventSubscription>(user.uid)
                          .set({
                            subscriptionType: subscriptionType,
                            subscribedToEvents: eventsSelectedID,
                            // @ts-ignore
                            time: serverTimestamp(),
                            payment: {
                              price: price,
                              status: status,
                              // @ts-ignore
                              time: serverTimestamp(),
                              author: user.uid,
                            },
                          });
                      } else {
                        this.afs
                          .collection(`majorEvents/${this.majorEventID}/subscriptions`)
                          .doc<MajorEventSubscription>(user.uid)
                          .update({
                            subscriptionType: subscriptionType,
                            subscribedToEvents: eventsSelectedID,
                            payment: {
                              price: price,
                              status: status,
                              // @ts-ignore
                              time: serverTimestamp(),
                              author: user.uid,
                            },
                          });
                      }

                      this.afs
                        .collection(`users/${user.uid}/majorEventSubscriptions`)
                        .doc(this.majorEventID)
                        .set({
                          reference: this.afs.doc(`majorEvents/${this.majorEventID}/subscriptions/${user.uid}`).ref,
                        })
                        .then(() => {
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
                } else {
                  this.alreadySubscribed.fire();
                  this.router.navigate(['/eventos'], { replaceUrl: true });

                  setTimeout(() => {
                    this.alreadySubscribed.close();
                  }, 1000);
                }
              });
          }
        });
      });
    });
  }

  async openConfirmModal(): Promise<boolean> {
    const eventsSelected: EventItem[] = Object.values(this.eventsSelected).reduce((acc, val) => acc.concat(val), []);

    eventsSelected.sort((a, b) => {
      return compareAsc(
        this.dateService.getDateFromTimestamp(a.eventStartDate),
        this.dateService.getDateFromTimestamp(b.eventStartDate)
      );
    });

    const modal = await this.modalController.create({
      component: ConfirmModalComponent,
      componentProps: {
        majorEvent$: this.majorEvent$,
        eventsSelected: eventsSelected,
        minicursosCount: this.eventsSelected.minicurso.length - this.eventGroupMinicursoCount,
        palestrasCount: this.eventsSelected.palestra.length,
        subscriptionType: this.opSelected,
      },
      showBackdrop: true,
    });
    await modal.present();

    return modal.onDidDismiss().then((data) => {
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

  checkForScheduleConflict(e, eventItem: EventItem) {
    if (this.isEventScheduleBeingChecked) {
      return;
    }

    this.isEventScheduleBeingChecked = true;
    // This doesn't unselect the event if it's already selected, it only disables it

    const checked: boolean = e.currentTarget.checked;

    const eventIndex = this.eventSchedule.findIndex((e) => e.id === eventItem.id);

    const eventItemStartDate = this.dateService.getDateFromTimestamp(eventItem.eventStartDate);
    const eventItemEndDate = this.dateService.getDateFromTimestamp(eventItem.eventEndDate);

    if (checked) {
      // For every event after eventIndex
      for (let i = eventIndex + 1; i < this.eventSchedule.length; i++) {
        const eventIterationStartDate = this.dateService.getDateFromTimestamp(this.eventSchedule[i].eventStartDate);
        const eventIterationEndDate = this.dateService.getDateFromTimestamp(this.eventSchedule[i].eventEndDate);
        // If event doesn't overlap or if it's itself, break
        if (
          eventItemStartDate >= eventIterationEndDate ||
          eventItemEndDate <= eventIterationStartDate ||
          eventItem.id === this.eventSchedule[i].id
        ) {
          break;
        }

        // If event overlaps, disable it

        if (this.eventSchedule[i].eventGroup.groupEventIDs) {
          this.eventSchedule[i].eventGroup.groupEventIDs.forEach((event) => {
            this.dataForm.get(event).disable();
          });
        } else {
          this.dataForm.get(this.eventSchedule[i].id).disable();
          this.dataForm.get(this.eventSchedule[i].id).setValue(null);
        }
      }

      // For every event before eventIdex
      for (let i = eventIndex - 1; i >= 0; i--) {
        const eventIterationStartDate = this.dateService.getDateFromTimestamp(this.eventSchedule[i].eventStartDate);
        const eventIterationEndDate = this.dateService.getDateFromTimestamp(this.eventSchedule[i].eventEndDate);

        // If event doesn't overlap or if it's itself, break
        if (
          eventItemStartDate >= eventIterationEndDate ||
          eventItemEndDate <= eventIterationStartDate ||
          eventItem.id === this.eventSchedule[i].id
        ) {
          break;
        }

        // If event overlaps, disable it

        if (this.eventSchedule[i].eventGroup.groupEventIDs) {
          this.eventSchedule[i].eventGroup.groupEventIDs.forEach((event) => {
            this.dataForm.get(event).disable();
          });
        } else {
          this.dataForm.get(this.eventSchedule[i].id).disable();
          this.dataForm.get(this.eventSchedule[i].id).setValue(null);
        }
      }
    } else {
      // For every event after eventIndex
      for (let i = eventIndex + 1; i < this.eventSchedule.length; i++) {
        const eventIterationStartDate = this.dateService.getDateFromTimestamp(this.eventSchedule[i].eventStartDate);

        // If event doesn't overlap, break
        if (eventIterationStartDate >= eventItemEndDate) {
          break;
        }

        // If event overlaps, enable it

        // TODO: Remove me. This is for secompp22 only
        if (this.eventSchedule[i].eventType !== 'palestra') {
          //////
          if (this.eventSchedule[i].slotsAvailable > 0) {
            if (this.eventSchedule[i].eventGroup.groupEventIDs) {
              this.eventSchedule[i].eventGroup.groupEventIDs.forEach((event) => {
                this.dataForm.get(event).enable();
              });
            } else {
              this.dataForm.get(this.eventSchedule[i].id).enable();
            }
          }
        }
      }

      // For every event before eventIdex
      for (let i = eventIndex - 1; i >= 0; i--) {
        const eventIterationEndDate = this.dateService.getDateFromTimestamp(this.eventSchedule[i].eventEndDate);

        // If event doesn't overlap, break
        if (eventIterationEndDate <= eventItemStartDate) {
          break;
        }

        // If event overlaps, enable it

        if (this.eventSchedule[i].eventType !== 'palestra') {
          if (this.eventSchedule[i].eventGroup.groupEventIDs) {
            this.eventSchedule[i].eventGroup.groupEventIDs.forEach((event) => {
              this.dataForm.get(event).enable();
            });
          } else {
            this.dataForm.get(this.eventSchedule[i].id).enable();
          }
        }
      }
    }
    this.isEventScheduleBeingChecked = false;
  }

  async showEventInfo(event: EventItem) {
    const modal = await this.modalController.create({
      component: InfoModalComponent,
      componentProps: {
        event: event,
      },
      showBackdrop: true,
    });
    await modal.present();
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

interface Subscription {
  id?: string;
  reference?: DocumentReference<any>;
}
