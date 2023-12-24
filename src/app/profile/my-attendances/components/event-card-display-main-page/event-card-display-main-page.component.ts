import { Component, Input, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { EventSubscriptionLocal } from 'src/app/profile/my-attendances/my-attendances.page';
import { AsyncPipe } from '@angular/common';

import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonGrid,
  IonRow,
  IonCol,
  IonButton,
  IonIcon,
  IonSpinner,
} from '@ionic/angular/standalone';
import { EventCardComponent } from 'src/app/profile/my-attendances/components/event-card/event-card.component';

@Component({
  selector: 'app-event-card-display-main-page[eventSubscriptionsInput]',
  templateUrl: './event-card-display-main-page.component.html',
  styleUrls: ['./event-card-display-main-page.component.scss'],
  standalone: true,
  imports: [
    AsyncPipe,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonGrid,
    IonRow,
    IonCol,
    IonButton,
    IonIcon,
    IonSpinner,
    EventCardComponent,
  ],
})
export class EventCardDisplayMainPageComponent implements OnInit {
  @Input() eventSubscriptionsInput!: Observable<EventSubscriptionLocal[]>;

  constructor() {}

  ngOnInit() {}
}
