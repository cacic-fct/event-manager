import { DatePipe, formatDate } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import type { PublicEvent } from '@cacic-eventos/shared-utils';
import { isSameDay } from 'date-fns';
import { CalendarEventListItem } from './calendar-event-list-item';

export interface CalendarWeekDay {
  label: string;
  date: Date;
}

@Component({
  selector: 'app-calendar-week-view',
  imports: [
    CalendarEventListItem,
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatListModule,
  ],
  templateUrl: './calendar-week-view.html',
  styleUrl: './calendar-week-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarWeekView {
  readonly weekDays = input.required<CalendarWeekDay[]>();
  readonly selectedDate = input.required<Date>();
  readonly events = input.required<PublicEvent[]>();
  readonly canGoPrevious = input(true);
  readonly returnUrl = input('/calendar');
  readonly previousWeek = output<void>();
  readonly nextWeek = output<void>();
  readonly today = output<void>();
  readonly selectDate = output<Date>();

  readonly selectedDateLabel = computed(() => {
    const formatted = formatDate(
      this.selectedDate(),
      "EEEE, dd 'de' MMMM 'de' yyyy",
      'pt-BR',
    );

    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  });

  readonly selectedDateEvents = computed(() =>
    this.events().filter((event) =>
      isSameDay(new Date(event.startDate), this.selectedDate()),
    ),
  );
}
