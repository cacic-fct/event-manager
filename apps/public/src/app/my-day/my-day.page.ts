import { DatePipe, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule, MatExpansionPanel } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink, UrlTree } from '@angular/router';
import { AuthService, TwemojiComponent } from '@cacic-fct/shared-angular';
import type { MyDayAction, MyDayAttentionItem, MyDayEvent } from '@cacic-fct/event-manager-public-contracts';
import { timeAwareGreeting } from '@cacic-fct/shared-utils';
import { addDays, isAfter, startOfDay, startOfWeek, subDays } from 'date-fns';
import { EMPTY, map, timer } from 'rxjs';
import { CalendarWeekDay } from '../calendar/week/week-view';
import { CalendarWeekDateSelector } from '../calendar/week/week-date-selector';
import { MyDayStore } from './my-day.store';
import { myDayCountdown, myDayDateKey, myDayTimeProgress } from './my-day-date';

@Component({
  selector: 'app-my-day',
  imports: [
    CalendarWeekDateSelector,
    DatePipe,
    MatButtonModule,
    MatExpansionModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    TwemojiComponent,
  ],
  templateUrl: './my-day.page.html',
  styleUrl: './my-day.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyDayPage {
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly routeTrees = new Map<string, UrlTree>();
  readonly store = inject(MyDayStore);
  readonly currentDate = toSignal(
    isPlatformBrowser(this.platformId)
      ? timer(millisecondsUntilNextMinute(), 60_000).pipe(map(() => new Date()))
      : EMPTY,
    { initialValue: new Date() },
  );
  readonly weekBaseDate = signal(startOfWeek(new Date(), { weekStartsOn: 0 }));

  readonly greeting = computed(() => {
    const claimName = this.auth.user()?.claims?.name;
    return timeAwareGreeting(this.currentDate(), typeof claimName === 'string' ? claimName : null, {
      firstNameOnly: true,
    });
  });
  readonly weekDays = computed<CalendarWeekDay[]>(() => {
    const labels = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    const baseDate = this.weekBaseDate();
    return labels.map((label, index) => ({ label, date: addDays(baseDate, index) }));
  });
  readonly selectedDate = computed(() => new Date(`${this.store.selectedDate()}T12:00:00-03:00`));
  readonly canGoPreviousWeek = computed(() => {
    const minimum = this.store.data()?.minimumDate;
    if (!minimum) {
      return true;
    }
    const minimumWeek = startOfWeek(new Date(`${minimum}T12:00:00-03:00`), { weekStartsOn: 0 });
    return isAfter(this.weekBaseDate(), minimumWeek);
  });
  readonly visibleAttention = computed(() => {
    const state = this.store.state();
    const items = state.data?.attention ?? [];
    return state.offline ? items.filter((item) => item.offlineCapable) : items;
  });

  constructor() {
    this.store.start();
    void this.store.load(myDayDateKey(new Date()));
  }

  selectDate(date: Date, panel: MatExpansionPanel): void {
    const minimum = this.store.data()?.minimumDate;
    const key = myDayDateKey(date);
    if (minimum && key < minimum) {
      return;
    }
    this.weekBaseDate.set(startOfWeek(date, { weekStartsOn: 0 }));
    void this.store.load(key);
    panel.close();
  }

  previousWeek(): void {
    if (!this.canGoPreviousWeek()) {
      return;
    }
    this.weekBaseDate.update((date) => subDays(date, 7));
  }

  nextWeek(): void {
    this.weekBaseDate.update((date) => addDays(date, 7));
  }

  goToToday(): void {
    const today = startOfDay(new Date());
    this.weekBaseDate.set(startOfWeek(today, { weekStartsOn: 0 }));
    void this.store.load(myDayDateKey(today));
  }

  countdown(event: MyDayEvent): string | null {
    return myDayCountdown(event.startDate, this.currentDate());
  }

  timeProgress(event: MyDayEvent): number {
    return myDayTimeProgress(event.startDate, this.currentDate());
  }

  eventActions(event: MyDayEvent): MyDayAction[] {
    const actions = [event.attendanceAction, ...event.sportsActions].filter(
      (action): action is MyDayAction => action != null,
    );
    return this.store.state().offline ? actions.filter((action) => action.offlineCapable) : actions;
  }

  attentionDescription(item: MyDayAttentionItem): string {
    return item.description;
  }

  link(route: string): UrlTree {
    const cached = this.routeTrees.get(route);
    if (cached) {
      return cached;
    }
    const tree = this.router.parseUrl(route);
    this.routeTrees.set(route, tree);
    return tree;
  }
}

function millisecondsUntilNextMinute(now = new Date()): number {
  return (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
}
