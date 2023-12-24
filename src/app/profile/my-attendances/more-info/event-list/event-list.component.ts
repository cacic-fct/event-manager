import { Component, Input, OnInit } from '@angular/core';
import { Observable } from 'rxjs';

import { EventItem } from 'src/app/shared/services/event';
import { EmojiService } from '../../../../shared/services/emoji.service';
import { DateService } from 'src/app/shared/services/date.service';

import { IonRouterLink, IonItemDivider, IonLabel, IonList, IonItem, IonSpinner } from '@ionic/angular/standalone';
import { formatDate, AsyncPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-event-list[eventInput]',
  templateUrl: './event-list.component.html',
  styleUrls: ['./event-list.component.scss'],
  standalone: true,
  imports: [
    AsyncPipe,
    IonItemDivider,
    IonLabel,
    IonList,
    IonItem,
    IonLabel,
    IonSpinner,
    RouterLink,
    IonRouterLink,
    DatePipe,
  ],
})
export class EventListComponent implements OnInit {
  @Input() eventInput!: Observable<EventItem[]>;
  @Input() isSubscribedList!: boolean;

  constructor(public emojiService: EmojiService, public dateService: DateService) {}

  ngOnInit() {}

  formatDate(date: Date): string {
    let formated = formatDate(date, "EEEE, dd 'de' MMMM 'de' yyyy", 'pt-BR');

    formated = formated.charAt(0).toUpperCase() + formated.slice(1);
    return formated;
  }
}
