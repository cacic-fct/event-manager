import { Component, Input, OnInit } from '@angular/core';
import { DateService } from 'src/app/shared/services/date.service';
import { MajorEventItem } from 'src/app/shared/services/major-event.service';

/**
 * Requires the majorEventItem input to be passed in.
 */
@Component({
  selector: 'app-major-event-display-date[majorEventItem]',
  templateUrl: './date.component.html',
  styleUrls: ['./date.component.scss', '../major-event-display.scss'],
})
export class DateComponent implements OnInit {
  @Input() majorEventItem!: MajorEventItem;

  constructor(public dateService: DateService) {}

  ngOnInit() {}
}
