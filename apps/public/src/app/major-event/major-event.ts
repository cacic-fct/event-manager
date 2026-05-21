import { DatePipe, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import type { CurrentUserMajorEventSubscription, PublicMajorEvent } from '@cacic-fct/shared-utils';
import { formatDateRange, getSubscriptionStatusLabel } from '@cacic-fct/shared-utils';
import { forkJoin, of } from 'rxjs';
import { EmojiService } from '../profile/attendances/emoji.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { MajorEventSubscriptionApiService } from './subscription/subscription-api.service';

type MajorEventPageState =
  | { status: 'loading' }
  | { status: 'ready'; events: PublicMajorEvent[]; subscriptions: CurrentUserMajorEventSubscription[] }
  | { status: 'error'; message: string };

const RECEIPT_UPLOAD_STATUSES = new Set([
  'WAITING_RECEIPT_UPLOAD',
  'REJECTED_INVALID_RECEIPT',
  'REJECTED_GENERIC',
  'REJECTED_NO_SLOTS',
  'REJECTED_SCHEDULE_CONFLICT',
]);

@Component({
  selector: 'app-major-event',
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
    MatToolbarModule,
    RouterLink,
  ],
  templateUrl: './major-event.html',
  styleUrl: './major-event.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MajorEvent {
  private readonly api = inject(MajorEventSubscriptionApiService);
  private readonly auth = inject(AuthService);
  private readonly analytics = inject(AnalyticsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  readonly emoji = inject(EmojiService);
  readonly isAuthenticated = this.auth.isAuthenticated;
  readonly pageState = signal<MajorEventPageState>({ status: 'loading' });

  readonly majorEvents = computed(() => {
    const state = this.pageState();
    if (state.status !== 'ready') {
      return [];
    }

    return [...state.events].sort((left, right) => Date.parse(left.startDate) - Date.parse(right.startDate));
  });

  readonly subscriptionsByMajorEventId = computed(() => {
    const state = this.pageState();
    if (state.status !== 'ready') {
      return new Map<string, CurrentUserMajorEventSubscription>();
    }

    return new Map(state.subscriptions.map((subscription) => [subscription.majorEventId, subscription]));
  });

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadPage();
    }
  }

  dateLine(majorEvent: PublicMajorEvent): string {
    return formatDateRange(majorEvent.startDate, majorEvent.endDate);
  }

  subscriptionFor(majorEventId: string): CurrentUserMajorEventSubscription | null {
    return this.subscriptionsByMajorEventId().get(majorEventId) ?? null;
  }

  isSubscriptionOpen(majorEvent: PublicMajorEvent): boolean {
    const now = Date.now();
    if (majorEvent.subscriptionStartDate && now < Date.parse(majorEvent.subscriptionStartDate)) {
      return false;
    }
    if (majorEvent.subscriptionEndDate && now > Date.parse(majorEvent.subscriptionEndDate)) {
      return false;
    }
    return true;
  }

  canUploadReceipt(subscription: CurrentUserMajorEventSubscription): boolean {
    return Boolean(
      subscription.majorEvent.isPaymentRequired && RECEIPT_UPLOAD_STATUSES.has(subscription.subscriptionStatus),
    );
  }

  canEditSubscription(subscription: CurrentUserMajorEventSubscription): boolean {
    return subscription.subscriptionStatus !== 'CONFIRMED' && subscription.subscriptionStatus !== 'CANCELED';
  }

  statusLabel(status: string): string {
    return getSubscriptionStatusLabel(status);
  }

  login(): void {
    void this.auth.login({ returnTo: '/major-event' });
  }

  private loadPage(): void {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setHours(0, 0, 0, 0);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    this.pageState.set({ status: 'loading' });
    forkJoin({
      events: this.api.listMajorEvents(threeMonthsAgo.toISOString()),
      subscriptions: this.isAuthenticated() ? this.api.listCurrentUserSubscriptions() : of([]),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ events, subscriptions }) => {
          this.pageState.set({ status: 'ready', events, subscriptions });
          this.analytics.trackEvent('major_event_list_viewed', {
            major_event_count: events.length,
            authenticated: this.isAuthenticated(),
          });
        },
        error: (error: unknown) =>
          this.pageState.set({
            status: 'error',
            message: error instanceof Error ? error.message : 'Não foi possível carregar os eventos.',
          }),
      });
  }
}
