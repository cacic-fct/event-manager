import { Component, Input, OnInit } from '@angular/core';
import { MajorEventItem } from 'src/app/shared/services/major-event.service';

/**
 * Requires the majorEventItem input to be passed in.
 */
@Component({
  selector: 'app-major-event-display-price[majorEventItem]',
  templateUrl: './price.component.html',
  styleUrls: ['./price.component.scss', '../major-event-display.scss'],
})
export class PriceComponent implements OnInit {
  @Input() majorEventItem!: MajorEventItem;

  constructor() {}

  ngOnInit() {}
}
