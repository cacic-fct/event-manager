import { AsyncPipe, DatePipe, DecimalPipe, formatDate } from '@angular/common';
import { Component, Input, OnInit, inject } from '@angular/core';
import {
  IonItem,
  IonList,
  IonItemDivider,
  IonLabel,
  IonButton,
  IonIcon,
  IonCheckbox,
  IonSpinner,
} from '@ionic/angular/standalone';
import { DateService } from 'src/app/shared/services/date.service';
import { EmojiService } from 'src/app/shared/services/emoji.service';
import { InfoModalComponent } from 'src/app/tabs/major-events-display/subscribe/info-modal/info-modal.component';

import { ModalController, ToastController } from '@ionic/angular/standalone';
import { EventItem } from 'src/app/shared/services/event';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Observable, take } from 'rxjs';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { User } from '@angular/fire/auth';
import { trace } from '@angular/fire/compat/performance';
import { MajorEventItem, MajorEventSubscription } from 'src/app/shared/services/major-event.service';
import { ClickStopPropagationDirective } from 'src/app/shared/directives/click-stop-propagation';
import { addIcons } from 'ionicons';
import { alertCircleOutline } from 'ionicons/icons';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
@UntilDestroy()
@Component({
  selector: 'app-event-list-form',
  templateUrl: './event-list-form.component.html',
  styleUrls: ['./event-list-form.component.scss'],
  standalone: true,
  imports: [
    ClickStopPropagationDirective,
    FormsModule,
    ReactiveFormsModule,
    InfoModalComponent,
    AsyncPipe,
    DatePipe,
    DecimalPipe,
    IonSpinner,
    IonCheckbox,
    IonIcon,
    IonButton,
    IonLabel,
    IonItemDivider,
    IonList,
    IonItem,
  ],
})
export class EventListFormComponent implements OnInit {
  @Input({ required: true }) majorEvent$!: Observable<MajorEventItem>;
  @Input({ required: true }) majorEventID!: string;
  @Input({ required: true }) isAlreadySubscribed!: boolean | undefined;
  @Input({ required: true }) user$!: Observable<User | null>;
  @Input({ required: true }) maxCourses!: number | undefined;
  @Input({ required: true }) maxLectures!: number | undefined;
  @Input({ required: true }) events$!: Observable<EventItem[]>;
  @Input({ required: true }) mandatoryEvents!: string[];

  eventList: EventItem[] = [];
  isEventScheduleBeingChecked = false;
  today: Date = new Date();
  public dataForm: FormGroup;
  private firestore: Firestore = inject(Firestore);
  public amountOfUncategorizedSelected = 0;
  public amountOfCoursesSelected = 0;
  public amountOfLecturesSelected = 0;
  public totalAmountOfEventsSelected = 0;

  constructor(
    private modalController: ModalController,
    private toastController: ToastController,
    public emojiService: EmojiService,
    public dateService: DateService,
    private formBuilder: FormBuilder,
  ) {
    addIcons({
      alertCircleOutline,
    });

    this.dataForm = this.formBuilder.group({});
  }

  ngOnInit() {
    this.events$.pipe(untilDestroyed(this)).subscribe((events) => {
      this.eventList = events;
      events.forEach((event) => {
        if (event.id && !this.dataForm.contains(event.id)) {
          this.dataForm.addControl(event.id, this.formBuilder.control(null));
        }
      });
    });

    this.events$.pipe(take(1)).subscribe((events) => {
      this.autoSelectMandatory(this.mandatoryEvents);

      if (this.isAlreadySubscribed) {
        this.selectAlreadySubscribed();
      }

      events.forEach((eventItem) => {
        // If there are no slots available, disable event
        if (
          !eventItem.slotsAvailable ||
          eventItem.slotsAvailable <= 0 ||
          // Or if event has already started, disable it
          this.dateService.getDateFromTimestamp(eventItem.eventStartDate) < this.today
        ) {
          this.blockEventGroup([eventItem]);
        }
      });
    });
  }

  selectAlreadySubscribed() {
    // If user is already subscribed, auto select events
    this.user$.pipe(take(1), trace('auth')).subscribe((user) => {
      if (user) {
        const subscriptionDocRef = doc(this.firestore, `majorEvents/${this.majorEventID}/subscriptions/${user.uid}`);
        const subscriptionData = docData(subscriptionDocRef) as Observable<MajorEventSubscription>;

        subscriptionData.pipe(take(1)).subscribe((subscription) => {
          if (subscription) {
            subscription.subscribedToEvents.forEach((eventID) => {
              this.dataForm.get(eventID)?.setValue(true);

              const event = this.eventList.find((event) => event.id === eventID);
              // Check if event is in mandatoryList

              if (!event) {
                return;
              }

              if (this.mandatoryEvents.includes(eventID)) {
                // If event is mandatory, disable it
                this.dataForm.get(eventID)?.disable();
              } else {
                this.dataForm.get(eventID)?.enable();
              }

              // If event is part of a group, but not the main event, don't count it
              if (event.eventGroup && event.eventGroup.mainEventID !== eventID) {
                return;
              }

              this.incrementAmountOfEventsSelected(event);
            });
          }
        });
      }
    });
  }

  incrementAmountOfEventsSelected(event: EventItem) {
    switch (event.eventType) {
      case 'minicurso':
        console.debug('DEBUG: Incrementing amount of courses selected');
        this.amountOfCoursesSelected++;
        this.totalAmountOfEventsSelected++;
        break;
      case 'palestra':
        console.debug('DEBUG: Incrementing amount of lectures selected');
        this.amountOfLecturesSelected++;
        this.totalAmountOfEventsSelected++;
        break;
      default:
        console.debug('DEBUG: Incrementing amount of uncategorized selected');
        this.amountOfUncategorizedSelected++;
        this.totalAmountOfEventsSelected++;
        break;
    }
  }

  decrementAmountOfEventsSelected(event: EventItem) {
    switch (event.eventType) {
      case 'minicurso':
        console.debug('DEBUG: Decrementing amount of courses selected');
        this.amountOfCoursesSelected--;
        this.totalAmountOfEventsSelected--;
        break;
      case 'palestra':
        console.debug('DEBUG: Decrementing amount of lectures selected');
        this.amountOfLecturesSelected--;
        this.totalAmountOfEventsSelected--;
        break;
      default:
        console.debug('DEBUG: Decrementing amount of uncategorized selected');
        this.amountOfUncategorizedSelected--;
        this.totalAmountOfEventsSelected--;
        break;
    }
  }

  autoSelectMandatory(mandatoryList: string[]) {
    if (mandatoryList.length === 0) {
      console.debug('DEBUG: autoSelectMandatory: No events are mandatory');
      return;
    }

    mandatoryList.forEach((event) => {
      console.debug('DEBUG: autoSelectMandatory: Event is mandatory:', event);
      const conflicts = this.checkConflicts(event);

      console.debug('DEBUG: autoSelectMandatory: Event', event, 'conflicts:', conflicts);
      this.blockEventGroup(conflicts);

      console.log(this.dataForm.get(event));
      console.log(this.dataForm.value);

      this.dataForm.get(event)?.setValue(true);
      this.dataForm.get(event)?.disable();
    });
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

  selectFromGroup(event: EventItem, startedBy: string) {
    console.debug('DEBUG: selectFromGroup():', event, 'started by', startedBy);
    if (!event.id) {
      return;
    }

    // If max amount of courses has been selected, unselect event
    if (
      this.maxCourses !== undefined &&
      this.maxCourses !== null &&
      event.eventType === 'minicurso' &&
      this.amountOfCoursesSelected >= this.maxCourses
    ) {
      this.dataForm.get(event.id)?.setValue(false);
      this.presentLimitReachedToast('minicursos', this.maxCourses.toString());
      return;
    } else if (
      this.maxLectures !== undefined &&
      this.maxLectures !== null &&
      event.eventType === 'palestra' &&
      this.amountOfLecturesSelected >= this.maxLectures
    ) {
      this.presentLimitReachedToast('palestras', this.maxLectures.toString());
      this.dataForm.get(event.id)?.setValue(false);
      return;
    }

    // If event has been selected
    if (this.dataForm.get(event.id)?.value) {
      const conflicts = this.checkConflicts(event.id);
      this.blockEventGroup(conflicts);

      // Select other events from the same group
      if (event.eventGroup?.groupEventIDs) {
        event.eventGroup.groupEventIDs.forEach((eventFromGroup) => {
          if (eventFromGroup === event.id) {
            this.incrementAmountOfEventsSelected(event);
            return;
          }
          this.dataForm.get(eventFromGroup)?.setValue(true);

          const conflicts = this.checkConflicts(eventFromGroup);
          this.blockEventGroup(conflicts);
        });
      } else {
        this.incrementAmountOfEventsSelected(event);
      }
      // If event has been unselected
    } else {
      const conflicts = this.checkConflicts(event.id);
      this.unblockEventGroup(conflicts);

      // Unselect other events from the same group
      if (event.eventGroup?.groupEventIDs) {
        event.eventGroup.groupEventIDs.forEach((eventFromGroup) => {
          if (eventFromGroup === event.id) {
            this.decrementAmountOfEventsSelected(event);
            return;
          }

          this.dataForm.get(eventFromGroup)?.setValue(false);

          const conflicts = this.checkConflicts(eventFromGroup);
          this.unblockEventGroup(conflicts);
        });
      } else {
        this.decrementAmountOfEventsSelected(event);
      }
    }
  }

  checkConflicts(selectedEventId: string): EventItem[] {
    const selectedEvent = this.eventList.find((event) => event.id === selectedEventId);
    const conflicts: EventItem[] = [];

    if (selectedEvent) {
      this.eventList.forEach((event) => {
        if (this.isConflict(selectedEvent, event)) {
          console.debug('DEBUG: Conflict found:', selectedEvent.name, 'with', event.name);
          conflicts.push(event);
        }
      });
    }
    return conflicts;
  }

  blockEventGroup(conflicts: EventItem[]) {
    conflicts.forEach((conflict) => {
      if (conflict.eventGroup?.groupEventIDs) {
        conflict.eventGroup.groupEventIDs.forEach((eventFromGroup) => {
          this.dataForm.get(eventFromGroup)?.disable();
          this.dataForm.get(eventFromGroup)?.setValue(false);
        });
      } else {
        if (conflict.id) {
          this.dataForm.get(conflict.id)?.disable();
        }
      }
    });
  }

  unblockEventGroup(conflicts: EventItem[]) {
    conflicts.forEach((conflict) => {
      if (conflict.eventGroup?.groupEventIDs) {
        conflict.eventGroup.groupEventIDs.forEach((eventFromGroup) => {
          this.dataForm.get(eventFromGroup)?.enable();
        });
      } else {
        if (conflict.id) {
          this.dataForm.get(conflict.id)?.enable();
        }
      }
    });
  }

  isConflict(event1: EventItem, event2: EventItem): boolean {
    const event1StartDate = this.dateService.getDateFromTimestamp(event1.eventStartDate);
    const event2StartDate = this.dateService.getDateFromTimestamp(event2.eventStartDate);

    // If event doesn't have end date, consider it the same as start date
    let event1EndDate = event1StartDate;
    let event2EndDate = event2StartDate;

    if (event1.eventEndDate && event2.eventEndDate) {
      event1EndDate = this.dateService.getDateFromTimestamp(event1.eventEndDate);
      event2EndDate = this.dateService.getDateFromTimestamp(event2.eventEndDate);
    }

    return (
      event1.id !== event2.id &&
      ((event1StartDate <= event2EndDate && event1EndDate >= event2StartDate) ||
        (event2StartDate <= event1EndDate && event2EndDate >= event1StartDate))
    );
  }

  formatDate(date: Date): string {
    let formated = formatDate(date, "EEEE, dd 'de' MMMM 'de' yyyy", 'pt-BR');

    formated = formated.charAt(0).toUpperCase() + formated.slice(1);
    return formated;
  }

  /**
   * If item was clicked, do the same as if the checkbox was clicked
   * @param eventItem
   * @returns
   */
  itemClick(eventItem: EventItem): void {
    const eventID = eventItem.id;
    if (!eventID) {
      return;
    }
    const formEvent = this.dataForm.get(eventID);
    console.debug('DEBUG: itemClick():', eventItem);

    if (!formEvent || formEvent?.disabled) {
      this.presentDisabledToast();
      return;
    }

    formEvent.setValue(!formEvent.value);

    this.selectFromGroup(eventItem, 'itemClick');
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

  async presentDisabledToast() {
    const toast = await this.toastController.create({
      header: `Evento indisponível`,
      message: `Confira o número de vagas ou se há choque de horário`,
      icon: 'alert-circle-outline',
      position: 'bottom',
      duration: 2000,
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
}
