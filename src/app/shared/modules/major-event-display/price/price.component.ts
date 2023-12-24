import { Component, Input, OnInit } from '@angular/core';
import { MajorEventItem } from 'src/app/shared/services/major-event.service';
import { IonIcon, IonItem, IonLabel } from '@ionic/angular/standalone';
import { CurrencyPipe } from '@angular/common';

/**
 * Requires the majorEventItem input to be passed in.
 */
@Component({
  selector: 'app-major-event-display-price[majorEventItem]',
  templateUrl: './price.component.html',
  styleUrls: ['./price.component.scss', '../major-event-display.scss'],
  standalone: true,
  imports: [IonIcon, IonItem, IonLabel, CurrencyPipe],
})
export class PriceComponent implements OnInit {
  @Input() majorEventItem!: MajorEventItem;

  constructor() {}

  ngOnInit() {}
}
