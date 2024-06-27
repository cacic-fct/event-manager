import { Component, Input } from '@angular/core';
import { DateService } from 'src/app/shared/services/date.service';
import { EventSubscriptionLocal } from 'src/app/profile/my-attendances/my-attendances.page';
import { AsyncPipe, DatePipe } from '@angular/common';

import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonGrid,
  IonRow,
  IonCol,
  IonButton,
  IonIcon,
  IonRouterLink,
} from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-event-card[eventSubscription]',
  templateUrl: './event-card.component.html',
  styleUrls: ['./event-card.component.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonRouterLink,
    AsyncPipe,
    DatePipe,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonGrid,
    IonRow,
    IonCol,
    IonButton,
    IonIcon,
  ],
})
export class EventCardComponent {
  @Input() eventSubscription!: EventSubscriptionLocal;

  constructor(public dateService: DateService) {}
}
