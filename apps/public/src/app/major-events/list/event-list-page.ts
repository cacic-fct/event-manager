import { DatePipe, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { PublicMajorEvent, PublicEventForm } from '@cacic-fct/event-manager-public-contracts';
import { AuthService, MarkdownComponent } from '@cacic-fct/shared-angular';
import type { CurrentUserMajorEventSubscription } from '@cacic-fct/shared-utils';
import { compareIsoDateAsc, formatDateRange, getSubscriptionStatusLabel } from '@cacic-fct/shared-utils';
import { isAfter, isBefore, parseISO, subMonths, startOfDay } from 'date-fns';
import { EMPTY, Subject, combineLatest, auditTime, catchError, forkJoin, map, merge, of, switchMap, timer } from 'rxjs';
import { EmojiService } from '../../shared/emoji.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { MajorEventSubscriptionApiService } from '../registration/subscription-api.service';
import { PublicPrizeDrawApiService } from '../../prize-draws/prize-draw-api.service';
import { RealtimeInvalidationService } from '../../shared/realtime-invalidation.service';
import { InterestToggle } from '../../interests/interest-toggle';
import { CurrentUserInterestState, InterestApiService } from '../../interests/interest-api.service';
import { PublicEventFormApiService } from '../../forms/event-form-api.service';
import { NetworkStatusService } from '../../shared/network-status.service';
import { TargetFormLinks } from '../../forms/target-form-links';

type MajorEventPageState =
  | { status: 'loading' }
  | {
      status: 'ready';
      events: PublicMajorEvent[];
      subscriptions: CurrentUserMajorEventSubscription[];
      prizeDrawTargetIds: string[];
      preview?: { expiresAt: string } | null;
    }
  | { status: 'error'; message: string };

const RECEIPT_UPLOAD_STATUSES = new Set([
  'WAITING_RECEIPT_UPLOAD',
  'REJECTED_INVALID_RECEIPT',
  'REJECTED_GENERIC',
  'REJECTED_NO_SLOTS',
  'REJECTED_SCHEDULE_CONFLICT',
]);
const PRIZE_DRAW_INVALIDATION_WINDOW_MS = 100;

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
    MarkdownComponent,
    RouterLink,
    InterestToggle,
    TargetFormLinks,
  ],
  templateUrl: './event-list-page.html',
  styleUrl: './event-list-page.css',
})
export class MajorEvent {
  private readonly api = inject(MajorEventSubscriptionApiService);
  private readonly auth = inject(AuthService);
  private readonly analytics = inject(AnalyticsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly currentTime = toSignal(isPlatformBrowser(this.platformId) ? timer(0, 30_000).pipe(map(() => Date.now())) : of(Date.now()), { initialValue: Date.now() });
  private readonly prizeDrawsApi = inject(PublicPrizeDrawApiService);
  private readonly realtime = inject(RealtimeInvalidationService);
  private readonly route = inject(ActivatedRoute);

  private readonly interestApi = inject(InterestApiService);
  private readonly formsApi = inject(PublicEventFormApiService);
  private readonly online = inject(NetworkStatusService).isOnline;
  private readonly participationRefresh = new Subject<void>();
  private readonly authChanges = toObservable(this.auth.isAuthenticated);
  private readonly onlineChanges = toObservable(this.online);
  readonly interestStates = signal<Partial<Record<string, CurrentUserInterestState>>>({});
  readonly participationLoading = signal(false);
  readonly participationForms = signal<PublicEventForm[]>([]);

  refreshParticipation(): void { this.participationRefresh.next(); }

  readonly emoji = inject(EmojiService);
  readonly isAuthenticated = this.auth.isAuthenticated;
  readonly pageState = signal<MajorEventPageState>({ status: 'loading' });
  private readonly previewToken = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('previewToken') ?? '')),
    {
      initialValue: '',
    },
  );

  readonly majorEvents = computed(() => {
    const state = this.pageState();
    if (state.status !== 'ready') {
      return [];
    }

    return [...state.events].sort((left, right) => compareIsoDateAsc(left.startDate, right.startDate));
  });

  readonly subscriptionsByMajorEventId = computed(() => {
    const state = this.pageState();
    if (state.status !== 'ready') {
      return new Map<string, CurrentUserMajorEventSubscription>();
    }

    return new Map(state.subscriptions.map((subscription) => [subscription.majorEventId, subscription]));
  });
  readonly isPreview = computed(() => Boolean(this.previewToken()));

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadPage();
    }
  }

  dateLine(majorEvent: PublicMajorEvent): string {
    return formatDateRange(majorEvent.startDate, majorEvent.endDate);
  }

  isEventFinished(majorEvent: PublicMajorEvent): boolean {
    return parseISO(majorEvent.endDate).getTime() <= this.currentTime();
  }

  subscriptionFor(majorEventId: string): CurrentUserMajorEventSubscription | null {
    return this.subscriptionsByMajorEventId().get(majorEventId) ?? null;
  }

  hasPrizeDraws(majorEventId: string): boolean {
    const state = this.pageState();
    return state.status === 'ready' && state.prizeDrawTargetIds.includes(majorEventId);
  }

  isSubscriptionOpen(majorEvent: PublicMajorEvent): boolean {
    const now = new Date();
    if (majorEvent.subscriptionStartDate && isBefore(now, parseISO(majorEvent.subscriptionStartDate))) {
      return false;
    }
    if (majorEvent.subscriptionEndDate && isAfter(now, parseISO(majorEvent.subscriptionEndDate))) {
      return false;
    }
    return true;
  }

  canUploadReceipt(subscription: CurrentUserMajorEventSubscription): boolean {
    return Boolean(
      subscription.majorEvent.isPaymentRequired && RECEIPT_UPLOAD_STATUSES.has(subscription.subscriptionStatus),
    );
  }

  canEditSubscription(majorEvent: PublicMajorEvent, subscription: CurrentUserMajorEventSubscription): boolean {
    if (subscription.subscriptionStatus === 'CANCELED') {
      return false;
    }
    if (subscription.subscriptionStatus !== 'CONFIRMED') {
      return true;
    }
    return Boolean(
      majorEvent.sportsTournament && majorEvent.hasEvents !== false && (subscription.selectedEvents?.length ?? 0) === 0,
    );
  }

  subscriptionRouteFor(majorEvent: PublicMajorEvent): string[] | null {
    if (majorEvent.hasEvents !== false) {
      return [
        '/major-event',
        majorEvent.id,
        majorEvent.rankedSubscriptionEnabled ? 'ranked-subscription' : 'subscription',
      ];
    }

    const tournament = majorEvent.sportsTournament;
    if (tournament?.selfSubscriptionEnabled) {
      return ['/tournament', tournament.id, 'subscribe'];
    }

    return null;
  }

  isSubscriptionRouteOpen(majorEvent: PublicMajorEvent): boolean {
    return majorEvent.hasEvents === false
      ? Boolean(majorEvent.sportsTournament?.selfSubscriptionEnabled && majorEvent.sportsTournament.registrationOpen)
      : this.isSubscriptionOpen(majorEvent) && majorEvent.regularSubscriptionOpen !== false;
  }

  subscriptionActionLabel(majorEvent: PublicMajorEvent, action: 'login' | 'create' | 'edit' | 'closed'): string {
    if (majorEvent.hasEvents === false) {
      return action === 'login' ? 'Entrar para solicitar inscrição' : 'Solicitar inscrição no torneio';
    }
    if (!majorEvent.sportsTournament) {
      return {
        login: 'Entrar para inscrever-se',
        create: 'Inscrever-se',
        edit: 'Editar inscrição',
        closed: 'Inscrições encerradas',
      }[action];
    }
    return {
      login: 'Entrar para inscrever-se nas atividades',
      create: 'Inscrever-se nas atividades',
      edit: 'Editar inscrição nas atividades',
      closed: 'Inscrições nas atividades encerradas',
    }[action];
  }

  statusLabel(status: string): string {
    return getSubscriptionStatusLabel(status);
  }

  login(): void {
    if (this.isPreview()) {
      return;
    }

    void this.auth.login({ returnTo: '/major-event' });
  }

  private loadPage(): void {
    const previewToken = this.route.snapshot.paramMap.get('previewToken');
    if (previewToken) {
      this.pageState.set({ status: 'loading' });
      this.api
        .getPreviewMajorEvents(previewToken)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: ({ events, expiresAt }) =>
            this.pageState.set({
              status: 'ready',
              events,
              subscriptions: [],
              prizeDrawTargetIds: [],
              preview: { expiresAt },
            }),
          error: (error: unknown) =>
            this.pageState.set({
              status: 'error',
              message: error instanceof Error ? error.message : 'Não foi possível carregar a pré-visualização.',
            }),
        });
      return;
    }

    const threeMonthsAgo = subMonths(startOfDay(new Date()), 3);

    this.pageState.set({ status: 'loading' });
    forkJoin({
      events: this.api.listMajorEvents(threeMonthsAgo.toISOString()),
      subscriptions: this.isAuthenticated() ? this.api.listCurrentUserSubscriptions() : of([]),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ events, subscriptions }) => {
          this.pageState.set({ status: 'ready', events, subscriptions, prizeDrawTargetIds: [] });
          this.loadPrizeDrawAvailability(events);
          this.loadParticipation(events);
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

  private loadParticipation(events: PublicMajorEvent[]): void {
    combineLatest([this.authChanges, this.onlineChanges]).pipe(
      switchMap(([authenticated, online]) => {
        if (!authenticated || !online) {
          this.interestStates.set({});
          this.participationForms.set([]);
          this.participationLoading.set(false);
          return EMPTY;
        }
        this.participationLoading.set(true);
        return merge(of(undefined), this.interestApi.changes, this.participationRefresh, this.realtime.watchCatalog()).pipe(
          auditTime(PRIZE_DRAW_INVALIDATION_WINDOW_MS),
          switchMap(() => {
            this.participationLoading.set(true);
            const targetIds = events.filter((event) => !this.isEventFinished(event)).map((event) => event.id);
            return forkJoin({
              states: this.interestApi.getStates('MAJOR_EVENT', targetIds).pipe(catchError(() => of({}))),
              forms: this.formsApi.listCurrentUserFormsForMajorEvents(events.map((event) => event.id)).pipe(catchError(() => of([]))),
            });
          }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ states, forms }) => {
      this.interestStates.set(states);
      this.participationForms.set(forms);
      this.participationLoading.set(false);
    });
  }

  private loadPrizeDrawAvailability(events: PublicMajorEvent[]): void {
    const majorEventIds = events.map((event) => event.id);
    const invalidations =
      isPlatformBrowser(this.platformId) && majorEventIds.length > 0
        ? this.realtime.watchCatalog().pipe(auditTime(PRIZE_DRAW_INVALIDATION_WINDOW_MS))
        : EMPTY;

    merge(of(undefined), invalidations)
      .pipe(
        switchMap(() => this.prizeDrawsApi.availability({ majorEventIds }).pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((availability) => {
        const state = this.pageState();
        if (state.status !== 'ready' || state.preview) {
          return;
        }

        this.pageState.set({
          ...state,
          prizeDrawTargetIds: availability.filter((item) => item.drawCount > 0).map((item) => item.targetId),
        });
      });
  }
}
