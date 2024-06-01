import { Component, Input } from '@angular/core';
import { MajorEventItem } from 'src/app/shared/services/major-event.service';

import { IonCardHeader, IonCardTitle } from '@ionic/angular/standalone';

@Component({
  // Requires the majorEventItem input to be passed in.
  selector: 'app-major-event-header[majorEventItem]',
  templateUrl: './major-event-header.component.html',
  styleUrls: ['./major-event-header.component.scss'],
  standalone: true,
  imports: [IonCardHeader, IonCardTitle],
})
export class MajorEventHeaderComponent {
  @Input() majorEventItem!: MajorEventItem;
}
