import { Component, Input, OnInit } from '@angular/core';
import { DateService } from 'src/app/shared/services/date.service';
import { EventSubscriptionLocal } from 'src/app/profile/my-attendances/my-attendances.page';

@Component({
  selector: 'app-event-card[eventSubscription]',
  templateUrl: './event-card.component.html',
  styleUrls: ['./event-card.component.scss'],
})
export class EventCardComponent implements OnInit {
  @Input() eventSubscription!: EventSubscriptionLocal;

  constructor(public dateService: DateService) {}

  ngOnInit() {}
}
