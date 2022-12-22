import { Component, Input, OnInit } from '@angular/core';
import { MajorEventItem } from 'src/app/shared/services/major-event.service';

/**
 * Requires the majorEventItem input to be passed in.
 */
@Component({
  selector: 'app-major-event-display-description[majorEventItem]',
  templateUrl: './description.component.html',
  styleUrls: ['./description.component.scss'],
})
export class DescriptionComponent implements OnInit {
  @Input() majorEventItem!: MajorEventItem;

  constructor() {}

  ngOnInit() {}
}
