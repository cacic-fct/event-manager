import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import type { PublicEvent } from '@cacic-eventos/shared-utils';
import { getEventTypeLabel } from '@cacic-eventos/shared-utils';
import {
  addDays,
  isAfter,
  isBefore,
  startOfDay,
  startOfWeek,
  subDays,
  subMonths,
} from 'date-fns';
import {
  Observable,
  catchError,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import {
  CalendarApiService,
  CalendarEventTypeFilter,
} from './calendar-api.service';
import { CalendarListView } from './calendar-list-view';
import { CalendarWeekDay, CalendarWeekView } from './calendar-week-view';

type CalendarViewMode = 'list' | 'week';

type CalendarState =
  | { status: 'loading' }
  | { status: 'ready'; events: PublicEvent[] }
  | { status: 'error'; message: string };

interface CalendarFilterValue {
  query: string;
  eventType: CalendarEventTypeFilter;
}

@Component({
  selector: 'app-calendar',
  imports: [
    CalendarListView,
    CalendarWeekView,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatToolbarModule,
    ReactiveFormsModule,
  ],
  templateUrl: './calendar.html',
  styleUrl: './calendar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Calendar {
  private readonly api = inject(CalendarApiService);
  private readonly todayDate = startOfDay(new Date());
  private readonly minimumDate = startOfDay(subMonths(this.todayDate, 1));

  readonly queryControl = new FormControl('', { nonNullable: true });
  readonly eventTypeControl = new FormControl<CalendarEventTypeFilter>('ALL', {
    nonNullable: true,
  });

  readonly viewMode = signal<CalendarViewMode>('list');
  readonly listStartDate = signal(this.todayDate);
  readonly weekBaseDate = signal(
    startOfWeek(this.todayDate, { weekStartsOn: 0 }),
  );
  readonly selectedDate = signal(this.todayDate);

  readonly eventTypeOptions: Array<{
    value: CalendarEventTypeFilter;
    label: string;
  }> = [
    { value: 'ALL', label: 'Todos os tipos' },
    { value: 'MINICURSO', label: getEventTypeLabel('MINICURSO') },
    { value: 'PALESTRA', label: getEventTypeLabel('PALESTRA') },
    { value: 'OTHER', label: getEventTypeLabel('OTHER') },
  ];

  readonly weekDays = computed<CalendarWeekDay[]>(() => {
    const labels = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    const baseDate = this.weekBaseDate();

    return labels.map((label, index) => ({
      label,
      date: addDays(baseDate, index),
    }));
  });

  readonly canLoadOlder = computed(() =>
    isAfter(this.listStartDate(), this.minimumDate),
  );

  readonly canGoPreviousWeek = computed(() =>
    isAfter(
      this.weekBaseDate(),
      startOfWeek(this.minimumDate, { weekStartsOn: 0 }),
    ),
  );

  readonly calendarState = toSignal(this.createCalendarState(), {
    initialValue: { status: 'loading' } satisfies CalendarState,
  });

  setViewMode(mode: string): void {
    if (mode === 'list' || mode === 'week') {
      this.viewMode.set(mode);
    }
  }

  loadOlderEvents(): void {
    if (!this.canLoadOlder()) {
      return;
    }

    const nextDate = subDays(this.listStartDate(), 7);
    this.listStartDate.set(
      isBefore(nextDate, this.minimumDate) ? this.minimumDate : nextDate,
    );
  }

  previousWeek(): void {
    if (!this.canGoPreviousWeek()) {
      return;
    }

    const nextBaseDate = subDays(this.weekBaseDate(), 7);
    this.weekBaseDate.set(nextBaseDate);
    this.selectedDate.set(nextBaseDate);
    this.ensureListIncludes(nextBaseDate);
  }

  nextWeek(): void {
    const nextBaseDate = addDays(this.weekBaseDate(), 7);
    this.weekBaseDate.set(nextBaseDate);
    this.selectedDate.set(nextBaseDate);
  }

  goToToday(): void {
    this.weekBaseDate.set(startOfWeek(this.todayDate, { weekStartsOn: 0 }));
    this.selectedDate.set(this.todayDate);
  }

  selectDate(date: Date): void {
    this.selectedDate.set(date);
    this.ensureListIncludes(date);
  }

  private createCalendarState(): Observable<CalendarState> {
    return combineLatest([
      this.filterChanges(),
      toObservable(this.listStartDate),
    ]).pipe(
      switchMap(([filters, startDate]) =>
        this.api
          .getCalendarEvents({
            query: filters.query.trim(),
            eventType: filters.eventType,
            startDateFrom: startDate.toISOString(),
          })
          .pipe(
            map(
              (events) =>
                ({
                  status: 'ready',
                  events,
                }) satisfies CalendarState,
            ),
            startWith({ status: 'loading' } satisfies CalendarState),
            catchError((error: unknown) =>
              of({
                status: 'error',
                message:
                  error instanceof Error
                    ? error.message
                    : 'Não foi possível carregar o calendário.',
              } satisfies CalendarState),
            ),
          ),
      ),
    );
  }

  private filterChanges(): Observable<CalendarFilterValue> {
    return combineLatest([
      this.queryControl.valueChanges.pipe(startWith(this.queryControl.value)),
      this.eventTypeControl.valueChanges.pipe(
        startWith(this.eventTypeControl.value),
      ),
    ]).pipe(
      debounceTime(250),
      map(([query, eventType]) => ({ query, eventType })),
      distinctUntilChanged(
        (left, right) =>
          left.query === right.query && left.eventType === right.eventType,
      ),
    );
  }

  private ensureListIncludes(date: Date): void {
    if (isBefore(date, this.listStartDate())) {
      this.listStartDate.set(
        isBefore(date, this.minimumDate) ? this.minimumDate : startOfDay(date),
      );
    }
  }
}
