import { formatDate } from '@angular/common';
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
import { isSameDay, isSameMonth, parseISO } from 'date-fns';
import { CalendarEventListItem } from './calendar-event-list-item';

interface CalendarListMonth {
  key: string;
  label: string;
  days: CalendarListDay[];
}

interface CalendarListDay {
  key: string;
  label: string;
  events: PublicEvent[];
}

@Component({
  selector: 'app-calendar-list-view',
  imports: [
    CalendarEventListItem,
    MatButtonModule,
    MatIconModule,
    MatListModule,
  ],
  templateUrl: './calendar-list-view.html',
  styleUrl: './calendar-list-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarListView {
  readonly events = input.required<PublicEvent[]>();
  readonly canLoadOlder = input(false);
  readonly isLoadingOlder = input(false);
  readonly returnUrl = input('/calendar');
  readonly loadOlder = output<void>();

  readonly groupedEvents = computed(() =>
    this.groupByMonthAndDay(this.events()),
  );

  private groupByMonthAndDay(events: PublicEvent[]): CalendarListMonth[] {
    const sortedEvents = [...events].sort(
      (left, right) => Date.parse(left.startDate) - Date.parse(right.startDate),
    );
    const months: CalendarListMonth[] = [];

    for (const event of sortedEvents) {
      const eventDate = parseISO(event.startDate);
      const lastMonth = months.at(-1);
      let month = lastMonth;

      if (!month || !isSameMonth(parseISO(month.key), eventDate)) {
        month = {
          key: event.startDate,
          label: this.formatMonth(event.startDate),
          days: [],
        };
        months.push(month);
      }

      const lastDay = month.days.at(-1);
      let day = lastDay;

      if (!day || !isSameDay(parseISO(day.key), eventDate)) {
        day = {
          key: event.startDate,
          label: this.formatDay(event.startDate),
          events: [],
        };
        month.days.push(day);
      }

      day.events.push(event);
    }

    return months;
  }

  private formatMonth(date: string): string {
    const formatted = formatDate(date, "MMMM 'de' yyyy", 'pt-BR');
    return this.capitalize(formatted);
  }

  private formatDay(date: string): string {
    const formatted = formatDate(date, "EEEE, dd 'de' MMMM 'de' yyyy", 'pt-BR');
    return this.capitalize(formatted);
  }

  private capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
