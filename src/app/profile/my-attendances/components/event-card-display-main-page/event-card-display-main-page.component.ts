import { Component, Input, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { EventSubscriptionLocal } from 'src/app/profile/my-attendances/my-attendances.page';

@Component({
  selector: 'app-event-card-display-main-page[eventSubscriptionsInput]',
  templateUrl: './event-card-display-main-page.component.html',
  styleUrls: ['./event-card-display-main-page.component.scss'],
})
export class EventCardDisplayMainPageComponent implements OnInit {
  @Input() eventSubscriptionsInput!: Observable<EventSubscriptionLocal[]>;

  constructor() {}

  ngOnInit() {}
}
