import { DatePipe, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { CalendarWeekDay } from './week-view';

@Component({
  selector: 'app-calendar-week-date-selector',
  imports: [DatePipe, MatButtonModule, MatIconModule],
  templateUrl: './week-date-selector.html',
  styleUrl: './week-date-selector.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarWeekDateSelector {
  readonly weekDays = input.required<CalendarWeekDay[]>();
  readonly selectedDate = input.required<Date>();
  readonly canGoPrevious = input(true);
  readonly canGoNext = input(true);
  readonly previousWeek = output<void>();
  readonly nextWeek = output<void>();
  readonly today = output<void>();
  readonly selectDate = output<Date>();

  readonly selectedDateLabel = computed(() => {
    const formatted = formatDate(this.selectedDate(), "EEEE, dd 'de' MMMM 'de' yyyy", 'pt-BR');
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  });
}
