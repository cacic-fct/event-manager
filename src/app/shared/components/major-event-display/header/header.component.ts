import { Component, Input, OnInit } from '@angular/core';
import { MajorEventItem } from 'src/app/shared/services/major-event.service';

import { IonCardHeader, IonCardTitle } from '@ionic/angular/standalone';

@Component({
  // Requires the majorEventItem input to be passed in.
  selector: 'app-major-event-display-header[majorEventItem]',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  standalone: true,
  imports: [IonCardHeader, IonCardTitle],
})
export class HeaderComponent implements OnInit {
  @Input() majorEventItem!: MajorEventItem;

  constructor() {}

  ngOnInit() {}
}
