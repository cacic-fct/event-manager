import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { isSameDay } from 'date-fns';
import { CalendarEventListItem } from '../event-list/event-list-item';
import { CalendarWeekDateSelector } from './week-date-selector';

export interface CalendarWeekDay {
  label: string;
  date: Date;
}

@Component({
  selector: 'app-calendar-week-view',
  imports: [CalendarEventListItem, CalendarWeekDateSelector, MatIconModule, MatListModule],
  templateUrl: './week-view.html',
  styleUrl: './week-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarWeekView {
  readonly weekDays = input.required<CalendarWeekDay[]>();
  readonly selectedDate = input.required<Date>();
  readonly events = input.required<PublicEvent[]>();
  readonly subscribedEventIds = input<ReadonlySet<string>>(new Set());
  readonly canGoPrevious = input(true);
  readonly returnUrl = input('/calendar');
  readonly previousWeek = output<void>();
  readonly nextWeek = output<void>();
  readonly today = output<void>();
  readonly selectDate = output<Date>();

  readonly selectedDateEvents = computed(() =>
    this.events().filter((event) => isSameDay(new Date(event.startDate), this.selectedDate())),
  );
}
