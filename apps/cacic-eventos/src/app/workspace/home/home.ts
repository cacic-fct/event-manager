import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, Signal, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltip } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import type {
  DashboardActionLink,
  DashboardCalendarEvent,
  DashboardCertificatePendingItem,
  DashboardInconsistency,
  DashboardInsightAction,
  DashboardPendingReceiptMajorEvent,
  WorkspaceDashboardInsights,
} from '@cacic-fct/shared-frontend-types';
import { Subscription, interval, startWith, switchMap } from 'rxjs';
import { DashboardApiService } from '../../graphql/dashboard-api.service';
import { TwemojiComponent } from '../../shared/components/twemoji.component';
import { workspaceNavItems } from '../workspace-nav';
import { MatProgressBarModule } from '@angular/material/progress-bar';

type WorkspaceDashboardHomeInsights = Omit<WorkspaceDashboardInsights, 'permissions'>;

@Component({
  selector: 'app-home',
  imports: [
    DatePipe,
    NgTemplateOutlet,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatTooltip,
    RouterLink,
    TwemojiComponent,
  ],
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly dashboardApi = inject(DashboardApiService);

  private minuteTimeoutId?: ReturnType<typeof setTimeout>;
  private minuteIntervalId?: ReturnType<typeof setInterval>;
  private insightsSubscription?: Subscription;

  readonly currentDate = signal<Date>(new Date());
  readonly insights = signal<WorkspaceDashboardHomeInsights | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly greetings: Signal<string> = computed(() => this.getGreetings());
  readonly navMap = computed(() => Object.fromEntries(workspaceNavItems.map((item) => [item.id, item])));
  readonly todayEvents = computed(() => this.insights()?.calendarEvents.filter((event) => this.isToday(event)) ?? []);
  readonly upcomingEvents = computed(
    () => this.insights()?.calendarEvents.filter((event) => !this.isToday(event)) ?? [],
  );
  readonly calendarHeadline = computed(() => {
    const count = this.insights()?.calendarEvents.length ?? 0;
    if (count === 0) {
      return 'Nenhum evento nos próximos 7 dias.';
    }

    return `${count} ${count === 1 ? 'evento acontecerá' : 'eventos acontecerão'} esta semana.`;
  });

  ngOnInit(): void {
    this.scheduleClock();
    this.insightsSubscription = interval(5 * 60 * 1000)
      .pipe(
        startWith(0),
        switchMap(() => {
          this.loading.set(true);
          this.error.set(null);
          return this.dashboardApi.getWorkspaceDashboardInsights();
        }),
      )
      .subscribe({
        next: (insights) => {
          this.insights.set(insights);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(error instanceof Error ? error.message : 'Não foi possível carregar o painel.');
          this.loading.set(false);
        },
      });
  }

  ngOnDestroy(): void {
    if (this.minuteTimeoutId) {
      clearTimeout(this.minuteTimeoutId);
    }
    if (this.minuteIntervalId) {
      clearInterval(this.minuteIntervalId);
    }
    this.insightsSubscription?.unsubscribe();
  }

  routerLinkForAction(action: DashboardActionLink): string[] {
    const path = this.pathForAction(action.action);
    if (action.action === 'OPEN_ATTENDANCE' && action.targetId) {
      return [path, 'event', action.targetId];
    }

    if (action.action === 'OPEN_CERTIFICATES' && action.targetId) {
      return [path, action.targetId];
    }

    return [path];
  }

  hasSuggestion(suggestions: DashboardActionLink[], action: DashboardInsightAction): boolean {
    return suggestions.some((suggestion) => suggestion.action === action);
  }

  routerLinkForInconsistency(issue: DashboardInconsistency): string[] {
    const action = issue.action ?? 'OPEN_EVENT';
    const targetId = issue.targetId ?? issue.eventId;
    const path = this.pathForAction(action);

    if (action === 'OPEN_ATTENDANCE' && targetId) {
      return [path, 'event', targetId];
    }

    if (
      (action === 'OPEN_EVENT' ||
        action === 'OPEN_EVENT_GROUP' ||
        action === 'OPEN_MAJOR_EVENT' ||
        action === 'OPEN_CERTIFICATES') &&
      targetId
    ) {
      return [path, targetId];
    }

    return [path];
  }

  eventAttendanceLink(event: DashboardCalendarEvent): string[] {
    return [this.navMap()['attendances']?.path ?? 'attendances', 'event', event.id];
  }

  certificateLink(item: DashboardCertificatePendingItem): string[] {
    const targetType =
      item.targetType === 'EVENT' ? 'event' : item.targetType === 'EVENT_GROUP' ? 'event-group' : 'major-event';

    return [this.navMap()['certificates']?.path ?? 'certificates', targetType, item.targetId];
  }

  receiptValidationLink(item: DashboardPendingReceiptMajorEvent): string[] {
    return [this.navMap()['subscriptions']?.path ?? 'subscriptions', 'major-event', item.majorEventId, 'validate-receipts'];
  }

  receiptMajorEventSummary(count: number): string {
    return `${count} ${count === 1 ? 'comprovante pendente' : 'comprovantes pendentes'}`;
  }

  describeEventType(type: string): string {
    switch (type) {
      case 'MINICURSO':
        return 'Minicurso';
      case 'PALESTRA':
        return 'Palestra';
      default:
        return 'Evento';
    }
  }

  private pathForAction(action: DashboardInsightAction): string {
    switch (action) {
      case 'CREATE_EVENT':
      case 'OPEN_EVENT':
        return this.navMap()['events']?.path ?? 'events';
      case 'CREATE_EVENT_GROUP':
      case 'OPEN_EVENT_GROUP':
        return this.navMap()['groups']?.path ?? 'groups';
      case 'CREATE_MAJOR_EVENT':
      case 'OPEN_MAJOR_EVENT':
        return this.navMap()['major-events']?.path ?? 'major-events';
      case 'OPEN_ATTENDANCE':
        return this.navMap()['attendances']?.path ?? 'attendances';
      case 'OPEN_CERTIFICATES':
        return this.navMap()['certificates']?.path ?? 'certificates';
      case 'OPEN_MERGE_CANDIDATES':
        return this.navMap()['merge-candidates']?.path ?? 'merge-candidates';
    }
  }

  private scheduleClock(): void {
    const update = () => this.currentDate.set(new Date());
    const now = new Date();
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

    this.minuteTimeoutId = setTimeout(() => {
      update();
      this.minuteIntervalId = setInterval(update, 60_000);
    }, msToNextMinute);
  }

  private getGreetings(): string {
    const hour = new Date().getHours();
    const name = this.authService.user()?.claims?.name;
    const greeting = hour < 5 ? 'Boa madrugada' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

    return name ? `${greeting}, ${name}!` : `${greeting}!`;
  }

  private isToday(event: DashboardCalendarEvent): boolean {
    const eventDate = new Date(event.startDate);
    const today = this.currentDate();
    return (
      eventDate.getFullYear() === today.getFullYear() &&
      eventDate.getMonth() === today.getMonth() &&
      eventDate.getDate() === today.getDate()
    );
  }
}
