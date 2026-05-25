import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import type { CurrentUserMajorEventSubscription, PublicEvent } from '@cacic-fct/shared-utils';
import { formatDateRange, getSubscriptionStatusLabel } from '@cacic-fct/shared-utils';
import { filter, finalize, map } from 'rxjs';
import { EmojiService } from '../../shared/emoji.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { ConfirmSubscriptionDialog, type ConfirmSubscriptionDialogData } from './confirm-subscription-dialog';
import { MajorEventSubscriptionApiService, type PublicMajorEventSubscriptionPage } from './subscription-api.service';
import { SubscriptionEventList } from './subscription-event-list';
import {
  MajorEventSubscriptionRealtimeDelta,
  MajorEventSubscriptionRealtimeService,
} from './subscription-realtime.service';

type SubscriptionPageState =
  | { status: 'loading' }
  | { status: 'ready'; data: PublicMajorEventSubscriptionPage }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-subscription',
  imports: [
    MatButtonModule,
    MatChipsModule,
    CurrencyPipe,
    MatDialogModule,
    MatIconModule,
    MatProgressBarModule,
    MatRadioModule,
    MatSnackBarModule,
    MatToolbarModule,
    RouterLink,
    RouterOutlet,
    SubscriptionEventList,
  ],
  templateUrl: './subscription.html',
  styleUrl: './subscription.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MajorEventSubscription {
  private readonly api = inject(MajorEventSubscriptionApiService);
  private readonly analytics = inject(AnalyticsService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly realtime = inject(MajorEventSubscriptionRealtimeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly emoji = inject(EmojiService);
  readonly isAuthenticated = this.auth.isAuthenticated;
  readonly isSubmitting = signal(false);
  readonly pageState = signal<SubscriptionPageState>({ status: 'loading' });
  readonly currentUserSubscription = signal<CurrentUserMajorEventSubscription | null | undefined>(undefined);
  readonly selectedEventIds = signal<Set<string>>(new Set());
  readonly selectedPriceTierName = signal<string | null>(null);

  private readonly initializedMajorEventId = signal<string | null>(null);
  private readonly pendingRealtimeDelta = signal<MajorEventSubscriptionRealtimeDelta | null>(null);
  private readonly navigationTick = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly majorEventId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('majorEventId') ?? params.get('eventID') ?? '')),
    { initialValue: this.route.snapshot.paramMap.get('majorEventId') ?? '' },
  );

  readonly childRouteActive = computed(() => {
    this.navigationTick();
    return Boolean(this.route.firstChild);
  });

  readonly data = computed(() => {
    const state = this.pageState();
    if (state.status !== 'ready' || !this.isSubscriptionPageData(state.data)) {
      return null;
    }

    return state.data;
  });

  readonly sortedEvents = computed(() => {
    const data = this.data();
    if (!data) {
      return [];
    }

    return [...data.events].sort((left, right) => Date.parse(left.startDate) - Date.parse(right.startDate));
  });

  readonly summariesByEventId = computed(
    () => new Map(this.data()?.subscriptionSummaries.map((summary) => [summary.eventId, summary]) ?? []),
  );

  readonly eventIdsByGroupKey = computed(() => {
    const eventsByGroupKey = new Map<string, string[]>();
    for (const event of this.sortedEvents()) {
      const groupKey = event.eventGroupId ?? event.id;
      const groupEventIds = eventsByGroupKey.get(groupKey) ?? [];
      groupEventIds.push(event.id);
      eventsByGroupKey.set(groupKey, groupEventIds);
    }
    return eventsByGroupKey;
  });

  readonly eventsById = computed(() => new Map(this.sortedEvents().map((event) => [event.id, event])));

  readonly autoSelectedEventIds = computed(
    () =>
      new Set(
        this.sortedEvents()
          .filter((event) => event.autoSubscribe)
          .map((event) => event.id),
      ),
  );

  readonly effectiveSelectedEventIds = computed(
    () => new Set([...this.selectedEventIds(), ...this.autoSelectedEventIds()]),
  );

  readonly selectedEvents = computed(() =>
    this.sortedEvents().filter((event) => this.effectiveSelectedEventIds().has(event.id)),
  );

  readonly courseCount = computed(() => this.selectedEvents().filter((event) => event.type === 'MINICURSO').length);

  readonly lectureCount = computed(() => this.selectedEvents().filter((event) => event.type === 'PALESTRA').length);

  readonly disabledReasons = computed(() => this.computeDisabledReasons());
  readonly priceTiers = computed(() => this.data()?.majorEvent.majorEventPrices?.flatMap((price) => price.tiers) ?? []);
  readonly selectedPriceTier = computed(() => {
    const selectedName = this.selectedPriceTierName();
    return this.priceTiers().find((tier) => tier.name === selectedName) ?? null;
  });

  statusLabel(status: string): string {
    return getSubscriptionStatusLabel(status);
  }

  constructor() {
    effect((onCleanup) => {
      const majorEventId = this.majorEventId();
      if (!majorEventId) {
        this.pageState.set({
          status: 'error',
          message: 'Página de inscrição inválida.',
        });
        return;
      }

      this.pageState.set({ status: 'loading' });
      this.initializedMajorEventId.set(null);
      this.pendingRealtimeDelta.set(null);
      this.selectedPriceTierName.set(null);

      const initialSubscription = this.api
        .getSubscriptionPage(majorEventId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (data) => {
            if (!this.isSubscriptionPageData(data)) {
              if (this.isRealtimeDelta(data)) {
                this.applyRealtimeDelta(data);
              }
              return;
            }

            this.pageState.set({
              status: 'ready',
              data: this.mergeRealtimeDelta(data, this.pendingRealtimeDelta()),
            });
          },
          error: (error: unknown) =>
            this.pageState.set({
              status: 'error',
              message: error instanceof Error ? error.message : 'Não foi possível carregar a inscrição.',
            }),
        });

      const realtimeSubscription = this.realtime
        .watch(majorEventId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (delta) => {
            if (this.isRealtimeDelta(delta)) {
              this.applyRealtimeDelta(delta);
            }
          },
          error: () => {
            this.snackBar.open('Atualizações ao vivo indisponíveis no momento.', 'OK', { duration: 4000 });
          },
        });

      onCleanup(() => {
        initialSubscription.unsubscribe();
        realtimeSubscription.unsubscribe();
      });
    });

    effect((onCleanup) => {
      const majorEventId = this.majorEventId();
      if (!majorEventId || !this.isAuthenticated()) {
        this.currentUserSubscription.set(null);
        return;
      }

      this.currentUserSubscription.set(undefined);
      this.initializedMajorEventId.set(null);
      const subscription = this.api
        .getCurrentUserSubscription(majorEventId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (data) => this.currentUserSubscription.set(data),
          error: () => this.currentUserSubscription.set(null),
        });

      onCleanup(() => subscription.unsubscribe());
    });

    effect(() => {
      const data = this.data();
      const currentUserSubscription = this.currentUserSubscription();
      if (!data || currentUserSubscription === undefined) {
        return;
      }

      const validEventIds = new Set(data.events.map((event) => event.id));
      const requiredEventIds = this.autoSelectedEventIds();
      const nextSelected = new Set([...this.selectedEventIds()].filter((eventId) => validEventIds.has(eventId)));
      for (const eventId of requiredEventIds) {
        nextSelected.add(eventId);
      }

      const majorEventId = data.majorEvent.id;
      if (this.initializedMajorEventId() !== majorEventId) {
        for (const event of currentUserSubscription?.selectedEvents ?? []) {
          if (validEventIds.has(event.id)) {
            nextSelected.add(event.id);
          }
        }
        this.initializedMajorEventId.set(majorEventId);
      }

      const tierNames = new Set(this.priceTiers().map((tier) => tier.name));
      const currentTier = currentUserSubscription?.paymentTier ?? this.selectedPriceTierName();
      if (currentTier && tierNames.has(currentTier) && currentTier !== this.selectedPriceTierName()) {
        this.selectedPriceTierName.set(currentTier);
      } else if (!currentTier && this.priceTiers().length === 1) {
        this.selectedPriceTierName.set(this.priceTiers()[0].name);
      }

      if (!this.setsEqual(this.selectedEventIds(), nextSelected)) {
        this.selectedEventIds.set(nextSelected);
      }
    });
  }

  dateLine(): string {
    const majorEvent = this.data()?.majorEvent;
    return majorEvent ? formatDateRange(majorEvent.startDate, majorEvent.endDate) : '';
  }

  submitButtonIcon(): string {
    const subscription = this.currentUserSubscription();
    if (subscription?.subscriptionStatus === 'CONFIRMED') {
      return 'check';
    }
    return subscription ? 'edit' : 'event_available';
  }

  submitButtonLabel(): string {
    const subscription = this.currentUserSubscription();
    if (subscription?.subscriptionStatus === 'CONFIRMED') {
      return 'Inscrito';
    }
    return subscription ? 'Atualizar inscrição' : 'Inscrever-se';
  }

  toggleEvent(event: PublicEvent): void {
    if (this.autoSelectedEventIds().has(event.id)) {
      return;
    }

    const groupEventIds = this.getGroupEventIds(event);
    const selectedEventIds = new Set(this.effectiveSelectedEventIds());
    const shouldUnselect = groupEventIds.every((eventId) => selectedEventIds.has(eventId));

    for (const eventId of groupEventIds) {
      if (this.autoSelectedEventIds().has(eventId)) {
        selectedEventIds.add(eventId);
      } else if (shouldUnselect) {
        selectedEventIds.delete(eventId);
      } else {
        selectedEventIds.add(eventId);
      }
    }

    this.selectedEventIds.set(selectedEventIds);
  }

  openInfo(event: PublicEvent): void {
    void this.router.navigate(['event', event.id], {
      relativeTo: this.route,
      queryParams: {
        returnUrl: this.router.url,
      },
    });
  }

  submit(): void {
    const data = this.data();
    if (!data || this.selectedEvents().length === 0 || this.isSubmitting()) {
      this.snackBar.open('Selecione pelo menos um evento.', 'OK', {
        duration: 3000,
      });
      return;
    }

    const selectedPaymentTier = this.resolveSelectedPaymentTier(data);
    if (data.majorEvent.isPaymentRequired && selectedPaymentTier === undefined) {
      this.snackBar.open('Selecione uma opção de preço.', 'OK', {
        duration: 3000,
      });
      return;
    }

    if (!this.isAuthenticated()) {
      void this.auth.login({ returnTo: this.router.url });
      return;
    }

    const dialogRef = this.dialog.open<ConfirmSubscriptionDialog, ConfirmSubscriptionDialogData, boolean>(
      ConfirmSubscriptionDialog,
      {
        data: {
          majorEvent: data.majorEvent,
          events: this.selectedEvents(),
        },
        width: 'min(720px, 96vw)',
      },
    );

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (confirmed) {
          this.confirmSubscription(data, selectedPaymentTier ?? null);
        }
      });
  }

  selectPriceTier(tierName: string): void {
    this.selectedPriceTierName.set(tierName);
  }

  private confirmSubscription(data: PublicMajorEventSubscriptionPage, paymentTier: string | null): void {
    this.isSubmitting.set(true);
    this.api
      .upsertSubscription(data.majorEvent.id, [...this.effectiveSelectedEventIds()], paymentTier)
      .pipe(
        finalize(() => this.isSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (subscription) => {
          const action = this.currentUserSubscription() ? 'updated' : 'created';
          this.currentUserSubscription.set(subscription);
          this.analytics.trackMajorEventSubscription({
            action,
            majorEvent: data.majorEvent,
            subscription,
            selectedEventCount: this.selectedEvents().length,
            paymentTier,
            priceInCents: this.selectedPriceTier()?.value ?? null,
          });
          this.snackBar.open('Inscrição realizada.', 'OK', { duration: 3000 });
          if (data.majorEvent.isPaymentRequired) {
            void this.router.navigate(['/major-event', data.majorEvent.id, 'payment']);
          }
        },
        error: (error: unknown) => {
          this.snackBar.open(error instanceof Error ? error.message : 'Não foi possível concluir a inscrição.', 'OK', {
            duration: 5000,
          });
        },
      });
  }

  private computeDisabledReasons(): ReadonlyMap<string, string> {
    const reasons = new Map<string, string>();
    const data = this.data();
    if (!data) {
      return reasons;
    }

    const now = Date.now();
    const selectedEventIds = this.selectedEventIds();
    const autoSelectedEventIds = this.autoSelectedEventIds();

    for (const event of this.sortedEvents()) {
      if (selectedEventIds.has(event.id) || autoSelectedEventIds.has(event.id)) {
        continue;
      }

      const summary = this.summariesByEventId().get(event.id);
      if (summary && !summary.hasAvailableSlots) {
        reasons.set(event.id, 'Sem vagas disponíveis.');
        continue;
      }

      if (Date.parse(event.startDate) <= now) {
        reasons.set(event.id, 'Evento já iniciado.');
        continue;
      }

      const limitReason = this.getLimitReason(event);
      if (limitReason) {
        reasons.set(event.id, limitReason);
        continue;
      }

      if (this.groupConflictsWithSelection(event)) {
        reasons.set(event.id, 'Conflito de horário com a seleção atual.');
      }
    }

    return reasons;
  }

  private getLimitReason(event: PublicEvent): string | null {
    const majorEvent = this.data()?.majorEvent;
    if (!majorEvent) {
      return null;
    }

    const groupEvents = this.getGroupEvents(event);
    const selectedEventIds = this.selectedEventIds();
    const newEvents = groupEvents.filter((groupEvent) => !selectedEventIds.has(groupEvent.id));
    const newCourses = newEvents.filter((groupEvent) => groupEvent.type === 'MINICURSO').length;
    const newLectures = newEvents.filter((groupEvent) => groupEvent.type === 'PALESTRA').length;

    if (
      majorEvent.maxCoursesPerAttendee != null &&
      this.courseCount() + newCourses > majorEvent.maxCoursesPerAttendee
    ) {
      return `Limite de ${majorEvent.maxCoursesPerAttendee} minicurso(s).`;
    }

    if (
      majorEvent.maxLecturesPerAttendee != null &&
      this.lectureCount() + newLectures > majorEvent.maxLecturesPerAttendee
    ) {
      return `Limite de ${majorEvent.maxLecturesPerAttendee} palestra(s).`;
    }

    return null;
  }

  private groupConflictsWithSelection(event: PublicEvent): boolean {
    const groupEvents = this.getGroupEvents(event);
    const groupEventIds = new Set(groupEvents.map((groupEvent) => groupEvent.id));
    const selectedEvents = this.selectedEvents().filter((selectedEvent) => !groupEventIds.has(selectedEvent.id));

    return groupEvents.some((groupEvent) =>
      selectedEvents.some((selectedEvent) => this.eventsConflict(groupEvent, selectedEvent)),
    );
  }

  private resolveSelectedPaymentTier(data: PublicMajorEventSubscriptionPage): string | null | undefined {
    const prices = data.majorEvent.majorEventPrices ?? [];
    const tiers = prices.flatMap((price) => price.tiers);
    if (tiers.length === 0) {
      return null;
    }

    if (tiers.length === 1) {
      return tiers[0].name;
    }

    return this.selectedPriceTier()?.name;
  }

  private eventsConflict(left: PublicEvent, right: PublicEvent): boolean {
    return (
      left.id !== right.id &&
      Date.parse(left.startDate) < Date.parse(right.endDate) &&
      Date.parse(left.endDate) > Date.parse(right.startDate)
    );
  }

  private getGroupEventIds(event: PublicEvent): string[] {
    const groupKey = event.eventGroupId ?? event.id;
    return this.eventIdsByGroupKey().get(groupKey) ?? [event.id];
  }

  private getGroupEvents(event: PublicEvent): PublicEvent[] {
    const eventsById = this.eventsById();
    return this.getGroupEventIds(event)
      .map((eventId) => eventsById.get(eventId))
      .filter((item): item is PublicEvent => Boolean(item));
  }

  private setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>) {
    if (left.size !== right.size) {
      return false;
    }

    for (const value of left) {
      if (!right.has(value)) {
        return false;
      }
    }

    return true;
  }

  private applyRealtimeDelta(delta: MajorEventSubscriptionRealtimeDelta): void {
    const currentState = this.pageState();
    if (currentState.status !== 'ready' || !this.isSubscriptionPageData(currentState.data)) {
      this.pendingRealtimeDelta.set(delta);
      return;
    }

    this.pendingRealtimeDelta.set(null);
    this.pageState.set({
      status: 'ready',
      data: this.mergeRealtimeDelta(currentState.data, delta),
    });
  }

  private mergeRealtimeDelta(
    data: PublicMajorEventSubscriptionPage,
    delta: MajorEventSubscriptionRealtimeDelta | null,
  ): PublicMajorEventSubscriptionPage {
    if (!delta) {
      return data;
    }

    const summariesByEventId = new Map(data.subscriptionSummaries.map((summary) => [summary.eventId, summary]));

    for (const summary of delta.subscriptionSummaries) {
      summariesByEventId.set(summary.eventId, summary);
    }

    return {
      ...data,
      subscriptionSummaries: [...summariesByEventId.values()],
    };
  }

  private isSubscriptionPageData(data: unknown): data is PublicMajorEventSubscriptionPage {
    return (
      typeof data === 'object' &&
      data !== null &&
      'majorEvent' in data &&
      'events' in data &&
      'subscriptionSummaries' in data &&
      Array.isArray(data.events) &&
      Array.isArray(data.subscriptionSummaries)
    );
  }

  private isRealtimeDelta(data: unknown): data is MajorEventSubscriptionRealtimeDelta {
    return (
      typeof data === 'object' &&
      data !== null &&
      !('events' in data) &&
      'subscriptionSummaries' in data &&
      Array.isArray(data.subscriptionSummaries)
    );
  }
}
