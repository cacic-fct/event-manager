import { Component, Input, OnInit, inject } from '@angular/core';
import { AsyncPipe, CurrencyPipe, DatePipe, DecimalPipe, formatDate } from '@angular/common';

import { MajorEventItem } from '../../../../shared/services/major-event.service';
import { EventItem } from '../../../../shared/services/event';
import { ModalController } from '@ionic/angular/standalone';
import { BehaviorSubject, Observable, combineLatest, map } from 'rxjs';
import { EnrollmentTypesService } from 'src/app/shared/services/enrollment-types.service';

import { EmojiService } from '../../../../shared/services/emoji.service';
import { DateService } from 'src/app/shared/services/date.service';

import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonCardHeader,
  IonCardContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonItemDivider,
  IonProgressBar,
  IonList,
  IonCardTitle,
} from '@ionic/angular/standalone';
import { SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';
import { Firestore } from '@angular/fire/firestore';
import { MajorEventInfoSubscriptionComponent } from 'src/app/tabs/major-events-display/subscribe/major-event-info-subscription/major-event-info-subscription.component';

@Component({
  selector: 'app-confirm-subscription-modal',
  templateUrl: './confirm-subscription-modal.component.html',
  styleUrls: ['./confirm-subscription-modal.component.scss'],
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonCardHeader,
    IonCardContent,
    IonIcon,
    IonItem,
    IonLabel,
    IonItemDivider,
    IonProgressBar,
    IonList,
    IonCardTitle,
    SweetAlert2Module,
    AsyncPipe,
    CurrencyPipe,
    DecimalPipe,
    DatePipe,
    MajorEventInfoSubscriptionComponent,
  ],
})
export class ConfirmSubscriptionModalComponent implements OnInit {
  @Input({ required: true }) majorEvent$!: Observable<MajorEventItem>;
  @Input({ required: true }) eventsSelected!: string[];
  @Input({ required: true }) minicursosCount!: number;
  @Input({ required: true }) palestrasCount!: number;
  @Input({ required: true }) subscriptionType!: string;
  @Input({ required: true }) events$!: Observable<EventItem[]>;

  displayEvents$: Observable<EventItem[]> | undefined;

  private eventsSelected$: BehaviorSubject<string[]> | undefined;

  firestore = inject(Firestore);

  constructor(
    private modalController: ModalController,
    public enrollmentTypes: EnrollmentTypesService,
    public emojiService: EmojiService,
    public dateService: DateService,
  ) {}

  ngOnInit() {
    if (this.majorEvent$ === undefined) {
      throw new Error('majorEvent$ is required');
    } else if (this.eventsSelected === undefined) {
      throw new Error('eventsSelected is required');
    } else if (this.minicursosCount === undefined) {
      throw new Error('minicursosCount is required');
    } else if (this.palestrasCount === undefined) {
      throw new Error('palestrasCount is required');
    } else if (this.events$ === undefined) {
      throw new Error('events$ is required');
    }

    // TODO: Make this more beautiful
    if (this.subscriptionType === undefined) {
      console.warn(
        'ConfirmSubscriptionModalComponent: subscriptionType is undefined. Does the event only have one price or did you forget to pass it in the parent component?',
      );
    }

    this.eventsSelected$ = new BehaviorSubject(this.eventsSelected);

    this.displayEvents$ = combineLatest([this.events$, this.eventsSelected$]).pipe(
      map(([events, selectedIds]) => {
        return events.filter((event) => event.id && selectedIds.includes(event.id));
      }),
    );
  }

  formatDate(date: Date): string {
    let formated = formatDate(date, "EEEE, dd 'de' MMMM 'de' yyyy", 'pt-BR');

    formated = formated.charAt(0).toUpperCase() + formated.slice(1);
    return formated;
  }

  onSubmit() {
    this.modalController.dismiss(true);
  }

  closeModal() {
    this.modalController.dismiss(false);
  }
}
