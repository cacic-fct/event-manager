import { Component, Input } from '@angular/core';
import { MajorEventItem } from 'src/app/shared/services/major-event.service';
import { IonCardContent } from '@ionic/angular/standalone';

/**
 * Requires the majorEventItem input to be passed in.
 */
@Component({
  selector: 'app-major-event-description[majorEventItem]',
  templateUrl: './major-event-description.component.html',
  styleUrls: ['./major-event-description.component.scss'],
  standalone: true,
  imports: [IonCardContent],
})
export class MajorEventDescriptionComponent {
  @Input() majorEventItem!: MajorEventItem;
}
