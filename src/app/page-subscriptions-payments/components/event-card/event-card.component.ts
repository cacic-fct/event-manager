import { Component, Input, OnInit } from '@angular/core';
import { DocumentReference } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { DateService } from 'src/app/shared/services/date.service';
import { EventSubscriptionLocal } from '../../page-subscriptions.page';

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
