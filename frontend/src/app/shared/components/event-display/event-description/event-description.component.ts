import { EventItem } from '../../../services/event';
import { Component, Input } from '@angular/core';

/**
 * Requires the eventItem input to be passed in.
 */
@Component({
  selector: 'app-event-description[eventItem]',
  templateUrl: './event-description.component.html',
  styleUrls: ['./event-description.component.scss'],
  standalone: true,
})
export class EventDescriptionComponent {
  @Input() eventItem!: EventItem;
}
