// @ts-strict-ignore
import { Component, Input } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AsyncPipe, CurrencyPipe, DatePipe, DecimalPipe, formatDate } from '@angular/common';

import { MajorEventItem } from '../../../../shared/services/major-event.service';
import { EventItem } from '../../../../shared/services/event';
import { ModalController } from '@ionic/angular/standalone';
import { Observable } from 'rxjs';
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
  ],
})
export class ConfirmSubscriptionModalComponent {
  @Input() majorEvent$: Observable<MajorEventItem>;
  @Input() eventsSelected: EventItem[];
  @Input() minicursosCount: number;
  @Input() palestrasCount: number;
  @Input() subscriptionType: string;

  constructor(
    public afs: AngularFirestore,
    private modalController: ModalController,
    public enrollmentTypes: EnrollmentTypesService,
    public emojiService: EmojiService,
    public dateService: DateService,
  ) {}

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
