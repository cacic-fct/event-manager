import { EventItem } from '../../../services/event';
import { Component, Input, OnInit } from '@angular/core';

/**
 * Requires the eventItem input to be passed in.
 */
@Component({
  selector: 'app-event-display-description[eventItem]',
  templateUrl: './description.component.html',
  styleUrls: ['./description.component.scss'],
})
export class DescriptionComponent implements OnInit {
  @Input() eventItem!: EventItem;

  constructor() {}

  ngOnInit() {}
}
