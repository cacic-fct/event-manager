// @ts-strict-ignore
import { formatDate } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { Observable } from 'rxjs';

import { EventItem } from 'src/app/shared/services/event';
import { EmojiService } from './../../../shared/services/emoji.service';
import { DateService } from 'src/app/shared/services/date.service';

@Component({
  selector: 'app-event-list',
  templateUrl: './event-list.component.html',
  styleUrls: ['./event-list.component.scss'],
})
export class EventListComponent implements OnInit {
  @Input() eventInput$: Observable<EventItem[]>;

  constructor(public emojiService: EmojiService, public dateService: DateService) {}

  ngOnInit() {}

  formatDate(date: Date): string {
    let formated = formatDate(date, "EEEE, dd 'de' MMMM 'de' yyyy", 'pt-BR');

    formated = formated.charAt(0).toUpperCase() + formated.slice(1);
    return formated;
  }
}
