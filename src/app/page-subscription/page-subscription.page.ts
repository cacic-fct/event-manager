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
import * as firestore from '@firebase/firestore';
import { Timestamp } from '@firebase/firestore-types';
import { formatDate } from '@angular/common';
import { fromUnixTime, isSameDay, compareAsc } from 'date-fns';
import { take, map, Observable, switchMap, combineLatest } from 'rxjs';

import { documentId } from '@firebase/firestore';

import { MajorEventItem } from '../shared/services/major-event.service';
import { EventItem } from '../shared/services/event';
import { ModalController, ToastController } from '@ionic/angular';

import { ConfirmModalComponent } from './confirm-modal/confirm-modal.component';
import { SwalComponent } from '@sweetalert2/ngx-sweetalert2';
import { trace } from '@angular/fire/compat/performance';

import { parse } from 'twemoji-parser';
import { DomSanitizer } from '@angular/platform-browser';
import { FormBuilder, FormGroup } from '@angular/forms';
import { increment } from '@angular/fire/firestore';

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
  disableEnrollmentTypeSelection: boolean = false;

  majorEventID = this.route.snapshot.params.eventID;

  constructor(
    private sanitizer: DomSanitizer,
    public afs: AngularFirestore,
    public auth: AngularFireAuth,
    private router: Router,
    private route: ActivatedRoute,
    private modalController: ModalController,
    private toastController: ToastController,
    public enrollmentTypes: EnrollmentTypesService,
    private formBuilder: FormBuilder
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

    // If majorEventID is not valid, redirect
    this.afs
      .collection('majorEvents')
      .doc(this.majorEventID)
      .get()
      .pipe(untilDestroyed(this), trace('firestore'))
      .subscribe((document) => {
        if (!document.exists) {
          this.eventNotFound.fire();
          setTimeout(() => {
            this.router.navigate(['eventos']);
            this.eventNotFound.close();
          }, 1000);
        }
      });

    // Check if user is already subscribed
    this.auth.user.pipe(take(1), trace('auth')).subscribe((user) => {
      if (user) {
        this.afs
          .doc<MajorEventSubscription>(`majorEvents/${this.majorEventID}/subscriptions/${user.uid}`)
          .valueChanges({ idField: 'id' })
          .pipe(take(1), trace('firestore'))
          .subscribe((subscription) => {
            if (subscription?.payment) {
              if (subscription.payment.status !== 4) {
                this.alreadySubscribed.fire();
                this.router.navigate(['/eventos'], { replaceUrl: true });

                setTimeout(() => {
                  this.alreadySubscribed.close();
                }, 1000);
              } else {
                this.disableEnrollmentTypeSelection = true;
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
            // If there are no slots available, add event to form with disabled selection
            if (eventItem.slotsAvailable <= 0) {
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

          if (!this.groupInSelection && event.eventGroup) {
            this.groupInSelection = true;
            event.eventGroup.forEach((eventFromGroup) => {
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

            if (!this.groupInSelection && event.eventGroup) {
              this.groupInSelection = true;
              event.eventGroup.forEach((eventFromGroup) => {
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

  dayCompare(date1: Timestamp, date2: Timestamp): boolean {
    return isSameDay(fromUnixTime(date1.seconds), fromUnixTime(date2.seconds));
  }

  formatDate(date: Date): string {
    let formated = formatDate(date, "EEEE, dd 'de' MMMM 'de' yyyy", 'pt-BR');

    formated = formated.charAt(0).toUpperCase() + formated.slice(1);
    return formated;
  }

  getDateFromTimestamp(timestamp: Timestamp): Date {
    return fromUnixTime(timestamp.seconds);
  }

  // Ununsed
  isBetweenDates(date1: Date, date2: Date, dateToCompare: Date): boolean {
    return compareAsc(date1, dateToCompare) === -1 && compareAsc(dateToCompare, date2) === -1;
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
                if (!subscription.reference) {
                  // Merge eventsSelected arrays
                  const eventsSelected = Object.values(this.eventsSelected).reduce((acc, val) => acc.concat(val), []);

                  // Create array with event IDs from eventsSelected
                  const eventsSelectedID = eventsSelected.map((event) => event.id);

                  const now: Timestamp = firestore.Timestamp.fromDate(new Date());

                  this.afs
                    .collection(`majorEvents/${this.majorEventID}/subscriptions`)
                    .doc<MajorEventSubscription>(user.uid)
                    .set({
                      subscriptionType: Number.parseInt(this.opSelected),
                      subscribedToEvents: eventsSelectedID,
                      time: now,
                      payment: {
                        price: price,
                        status: 0,
                        time: now,
                        author: user.uid,
                      },
                    })
                    .then(() => {
                      this.afs
                        .collection(`users/${user.uid}/majorEventSubscriptions`)
                        .doc(this.majorEventID)
                        .set({
                          reference: this.afs.doc(`majorEvents/${this.majorEventID}/subscriptions/${user.uid}`).ref,
                          inMajorEvent: this.majorEventID,
                        })
                        .then(() => {
                          eventsSelectedID.forEach((eventID) => {
                            this.afs.doc(`events/${eventID}`).update({
                              numberOfSubscriptions: increment(1),
                            });

                            this.afs.doc(`events/${eventID}/subscriptions/${user.uid}`).set({
                              time: now,
                            });
                          });
                          this.successSwal.fire();
                          setTimeout(() => {
                            this.successSwal.close();
                            this.router.navigate(['/inscricoes/pagar', this.majorEventID], { replaceUrl: true });
                          }, 2000);
                        });
                    })
                    .catch((error) => {
                      console.error(error);
                      this.errorSwal.fire();
                    });

                  setTimeout(() => {
                    this.successSwal.close();
                    this.router.navigate(['/eventos'], { replaceUrl: true });
                  }, 1500);
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
      return compareAsc(this.getDateFromTimestamp(a.eventStartDate), this.getDateFromTimestamp(b.eventStartDate));
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

  getEmoji(emoji: string): any {
    if (emoji === undefined) {
      return this.sanitizer.bypassSecurityTrustResourceUrl(parse('❔')[0].url);
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(parse(emoji)[0].url);
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
}

interface Subscription {
  id?: string;
  reference?: DocumentReference<any>;
}
