import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { DestroyRef, Service, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import type { EventType, PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { AuthService } from '@cacic-fct/shared-angular';
import { interestedEventIds } from '@cacic-fct/shared-event-participation';
import type { CurrentUserMajorEventSubscription } from '@cacic-fct/shared-utils';
import {
  compareIsoDateAsc,
  formatDateRange,
  getEventTypeLabel,
  getSubscriptionStatusLabel,
} from '@cacic-fct/shared-utils';
import { isBefore, parseISO } from 'date-fns';
import { EMPTY, catchError, finalize, map } from 'rxjs';
import { AnalyticsService } from '../../../analytics/analytics.service';
import { RateLimitError, createRateLimitCooldown } from '../../../shared/rate-limit-error';
import { SubscriptionFormFlowService } from '../standard/subscription-form-flow.service';
import {
  createMajorEventSubscriptionFlowSources,
  createSubscriptionFlowDraft,
  toSubmitSubscriptionFormResponses,
  toSubscriptionFormAnswers,
  type SubscriptionFlowDraft,
  type SubscriptionFormAnswer,
  type SubscriptionFormContext,
} from '../standard/subscription-flow.models';
import {
  SubscriptionReviewDialog,
  type SubscriptionReviewDialogData,
  type SubscriptionReviewDialogResult,
} from '../standard/subscription-review-dialog';
import { MajorEventSubscriptionApiService, type PublicMajorEventSubscriptionPage } from '../subscription-api.service';
import { MajorEventSubscriptionRealtimeDelta, MajorEventSubscriptionRealtimeService } from '../realtime.service';
import { subscriptionSuccessRoute } from '../subscription-success-route';
import { resolveRegistrationDecisions } from '../tier/registration-decisions';
import {
  automaticEventIds as getAutomaticEventIds,
  automaticSelectionLimitViolations,
  categoryLimits,
  selectableEventIds as getSelectableEventIds,
  subscriptionTierRuleSummaries,
} from '../tier/subscription-tier-policy';

export type RankedSubscriptionPageState =
  | { status: 'loading' }
  | { status: 'ready'; data: PublicMajorEventSubscriptionPage }
  | { status: 'error'; message: string };

export type RankedCategory = 'course' | 'lecture' | 'uncategorized';

export interface RankedItem {
  key: string;
  label: string;
  emoji: string;
  type: EventType;
  eventIds: string[];
  events: PublicEvent[];
}

export interface RankedSubscriptionFormFlow {
  eventIds: string[];
  events: PublicEvent[];
  forms: SubscriptionFormContext[];
  draft: SubscriptionFlowDraft;
  paymentTier: string | null;
}

@Service({ autoProvided: false })
export class RankedSubscriptionStore {
  private readonly api = inject(MajorEventSubscriptionApiService);
  private readonly analytics = inject(AnalyticsService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly formFlow = inject(SubscriptionFormFlowService);
  private readonly realtime = inject(MajorEventSubscriptionRealtimeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly subscriptionCooldown = createRateLimitCooldown(this.destroyRef);

  readonly isAuthenticated = this.auth.isAuthenticated;
  readonly interestedEventIds = computed(() =>
    interestedEventIds(this.data()?.events ?? [], this.data()?.interests ?? []),
  );
  readonly isSubmitting = signal(false);
  readonly isPreparingSubscriptionFlow = signal(false);
  readonly subscriptionCooldownSeconds = this.subscriptionCooldown.seconds;
  readonly pageState = signal<RankedSubscriptionPageState>({ status: 'loading' });
  readonly currentUserSubscription = signal<CurrentUserMajorEventSubscription | null | undefined>(undefined);
  readonly confirmedSportsOnlySubscription = computed(() => {
    const subscription = this.currentUserSubscription();
    const majorEvent = this.data()?.majorEvent;
    return (
      subscription?.subscriptionStatus === 'CONFIRMED' &&
      subscription.selectedEvents?.length === 0 &&
      Boolean(majorEvent?.sportsTournament) &&
      (!majorEvent?.isPaymentRequired || this.selectedPriceTier()?.includesSportsRegistration === true)
    );
  });
  readonly selectedEventIds = signal<ReadonlySet<string>>(new Set());
  readonly rankingItems = signal<RankedItem[]>([]);
  readonly notWantedItems = signal<RankedItem[]>([]);
  readonly selectedPriceTierName = signal<string | null>(null);
  readonly desiredCourses = signal(0);
  readonly desiredLectures = signal(0);
  readonly desiredUncategorized = signal(0);
  readonly subscriptionFormFlow = signal<RankedSubscriptionFormFlow | null>(null);
  readonly needsImageLicenseAgreement = computed(() => {
    const data = this.data();
    const subscription = this.currentUserSubscription();
    return Boolean(
      data?.majorEvent.requiresImageLicenseAgreement &&
        subscription &&
        subscription.imageLicenseAgreementAccepted !== true,
    );
  });

  private readonly initializedMajorEventId = signal<string | null>(null);
  private readonly agreementFlowAutoStartAttempted = signal(false);
  private readonly pendingRealtimeDelta = signal<MajorEventSubscriptionRealtimeDelta | null>(null);
  private readonly subscriptionFlowDraft = signal<SubscriptionFlowDraft | null>(null);
  private readonly imageLicenseAgreementQueryRequested = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('requireImageLicenseAgreement') === 'true')),
    { initialValue: false },
  );

  readonly majorEventId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('majorEventId') ?? params.get('eventID') ?? '')),
    { initialValue: this.route.snapshot.paramMap.get('majorEventId') ?? '' },
  );

  readonly data = computed(() => {
    const state = this.pageState();
    return state.status === 'ready' ? state.data : null;
  });

  readonly allSortedEvents = computed(() =>
    [...(this.data()?.events ?? [])].sort((left, right) => compareIsoDateAsc(left.startDate, right.startDate)),
  );
  readonly policyPriceTier = computed(() =>
    this.data()?.majorEvent.isPaymentRequired === true ? this.selectedPriceTier() : null,
  );
  readonly selectableEventIds = computed(() =>
    getSelectableEventIds(this.decisions().includesEvents ? this.allSortedEvents() : [], this.policyPriceTier()),
  );
  readonly sortedEvents = computed(() =>
    this.allSortedEvents().filter((event) => this.selectableEventIds().has(event.id)),
  );
  readonly eventsById = computed(() => new Map(this.allSortedEvents().map((event) => [event.id, event])));
  readonly summariesByEventId = computed(
    () => new Map(this.data()?.subscriptionSummaries.map((summary) => [summary.eventId, summary]) ?? []),
  );
  readonly autoSelectedEventIds = computed(() => {
    if (!this.decisions().includesEvents) {
      return new Set<string>();
    }
    return getAutomaticEventIds(this.sortedEvents(), this.policyPriceTier());
  });
  readonly effectiveSelectedEventIds = computed(() =>
    this.decisions().includesEvents
      ? new Set([
          ...[...this.selectedEventIds()].filter((eventId) => this.selectableEventIds().has(eventId)),
          ...this.autoSelectedEventIds(),
        ])
      : new Set<string>(),
  );
  readonly selectedEvents = computed(() =>
    this.sortedEvents().filter((event) => this.effectiveSelectedEventIds().has(event.id)),
  );
  readonly autoSelectedEvents = computed(() =>
    this.sortedEvents().filter((event) => this.autoSelectedEventIds().has(event.id)),
  );
  readonly disabledReasons = computed(() => this.computeDisabledReasons());
  readonly priceTiers = computed(() => this.data()?.majorEvent.majorEventPrices?.flatMap((price) => price.tiers) ?? []);
  readonly selectedPriceTier = computed(() => {
    const selectedName = this.selectedPriceTierName();
    return this.priceTiers().find((tier) => tier.name === selectedName) ?? null;
  });
  readonly effectiveCategoryLimits = computed(() =>
    categoryLimits(this.data()?.majorEvent ?? null, this.policyPriceTier()),
  );
  readonly selectedTierRuleSummaries = computed(() => {
    const data = this.data();
    return data ? subscriptionTierRuleSummaries(data.majorEvent, this.policyPriceTier(), data.events) : [];
  });
  readonly automaticSelectionErrors = computed(() => {
    const data = this.data();
    return data ? automaticSelectionLimitViolations(data.majorEvent, data.events, this.policyPriceTier()) : [];
  });
  readonly decisions = computed(() =>
    resolveRegistrationDecisions(this.data()?.majorEvent ?? null, this.selectedPriceTier()),
  );
  readonly tierSelectionLocked = computed(() => this.currentUserSubscription()?.subscriptionStatus === 'CONFIRMED');
  readonly courseOptions = computed(() => this.categoryOptions('course'));
  readonly lectureOptions = computed(() => this.categoryOptions('lecture'));
  readonly uncategorizedOptions = computed(() => this.categoryOptions('uncategorized'));

  constructor() {
    effect((onCleanup) => {
      const majorEventId = this.majorEventId();
      if (!majorEventId) {
        this.pageState.set({ status: 'error', message: 'Página de inscrição inválida.' });
        return;
      }

      untracked(() => {
        this.pageState.set({ status: 'loading' });
        this.initializedMajorEventId.set(null);
        this.agreementFlowAutoStartAttempted.set(false);
        this.pendingRealtimeDelta.set(null);
        this.selectedPriceTierName.set(null);
        this.subscriptionFormFlow.set(null);
        this.subscriptionFlowDraft.set(null);
        this.subscriptionCooldown.clear();
      });

      const initialSubscription = this.api.getSubscriptionPage(majorEventId, this.isAuthenticated()).subscribe({
        next: (data) =>
          this.pageState.set({ status: 'ready', data: this.mergeRealtimeDelta(data, this.pendingRealtimeDelta()) }),
        error: (error: unknown) =>
          this.pageState.set({
            status: 'error',
            message: error instanceof Error ? error.message : 'Não foi possível carregar a inscrição.',
          }),
      });

      const realtimeSubscription = this.realtime.watch(majorEventId).subscribe({
        next: (delta) => this.applyRealtimeDelta(delta),
        error: () => this.snackBar.open('Atualizações ao vivo indisponíveis no momento.', 'OK', { duration: 4000 }),
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
      const subscription = this.api.getCurrentUserSubscription(majorEventId).subscribe({
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

      untracked(() => this.initializeFromPageData(data, currentUserSubscription));
    });

    effect(() => {
      if (
        !this.imageLicenseAgreementQueryRequested() ||
        !this.needsImageLicenseAgreement() ||
        !this.data() ||
        this.currentUserSubscription() === undefined ||
        this.initializedMajorEventId() !== this.data()?.majorEvent.id ||
        this.agreementFlowAutoStartAttempted()
      ) {
        return;
      }

      this.agreementFlowAutoStartAttempted.set(true);
      untracked(() => this.submit());
    });
  }

  dateLine(): string {
    const majorEvent = this.data()?.majorEvent;
    return majorEvent ? formatDateRange(majorEvent.startDate, majorEvent.endDate) : '';
  }

  statusLabel(status: string): string {
    return getSubscriptionStatusLabel(status);
  }

  eventTypeLabel(event: PublicEvent): string {
    return getEventTypeLabel(event.type);
  }

  toggleEvent(event: PublicEvent): void {
    if (
      !this.decisions().includesEvents ||
      !this.selectableEventIds().has(event.id) ||
      this.autoSelectedEventIds().has(event.id)
    ) {
      return;
    }
    const eventIds = this.getEventIdsForStepOneToggle(event);
    const selected = new Set(this.effectiveSelectedEventIds());
    const shouldRemove = eventIds.every((eventId) => selected.has(eventId));
    for (const eventId of eventIds) {
      if (shouldRemove && !this.autoSelectedEventIds().has(eventId)) {
        selected.delete(eventId);
      } else {
        selected.add(eventId);
      }
    }
    this.selectedEventIds.set(selected);
    this.syncRankedItems();
    this.syncDesiredDefaults();
  }

  openInfo(event: PublicEvent): void {
    void this.router.navigate(['event', event.id], {
      relativeTo: this.route,
      queryParams: { returnUrl: this.router.url, tierEventAllowed: this.selectableEventIds().has(event.id) },
    });
  }

  drop(event: CdkDragDrop<RankedItem[]>): void {
    if (!this.decisions().includesEvents) {
      return;
    }
    if (event.previousContainer === event.container) {
      const items = [...event.container.data];
      moveItemInArray(items, event.previousIndex, event.currentIndex);
      this.setDropListItems(event.container.id, items);
      return;
    }

    const previous = [...event.previousContainer.data];
    const current = [...event.container.data];
    transferArrayItem(previous, current, event.previousIndex, event.currentIndex);
    this.setDropListItems(event.previousContainer.id, previous);
    this.setDropListItems(event.container.id, current);
    this.selectedEventIds.set(new Set(this.rankingItems().flatMap((item) => item.eventIds)));
    this.syncDesiredDefaults();
  }

  selectPriceTier(tierName: string): void {
    if (this.tierSelectionLocked() || !this.priceTiers().some((tier) => tier.name === tierName)) {
      return;
    }
    if (tierName === this.selectedPriceTierName()) {
      return;
    }
    const previousSelection = this.selectedEventIds();
    this.selectedPriceTierName.set(tierName);
    const availableIds = this.selectableEventIds();
    this.selectedEventIds.set(new Set([...previousSelection].filter((eventId) => availableIds.has(eventId))));
    this.syncRankedItems();
    this.syncDesiredDefaults();
    this.subscriptionFormFlow.set(null);
    this.subscriptionFlowDraft.set(null);
  }

  submit(): void {
    const data = this.data();
    if (
      !data ||
      this.currentUserSubscription() === undefined ||
      this.isSubmitting() ||
      this.isPreparingSubscriptionFlow()
    ) {
      return;
    }

    if (this.automaticSelectionErrors().length > 0) {
      this.snackBar.open(this.automaticSelectionErrors()[0], 'OK', { duration: 5000 });
      return;
    }

    const rankedEventIds = this.decisions().includesEvents
      ? [...this.autoSelectedEventIds(), ...this.rankingItems().flatMap((item) => item.eventIds)]
      : [];
    if (this.decisions().includesEvents && rankedEventIds.length === 0) {
      this.snackBar.open('Selecione pelo menos um evento.', 'OK', { duration: 3000 });
      return;
    }

    const selectedPaymentTier = this.resolveSelectedPaymentTier(data);
    if (data.majorEvent.isPaymentRequired && selectedPaymentTier === undefined) {
      this.snackBar.open('Selecione uma opção de preço.', 'OK', { duration: 3000 });
      return;
    }

    if (!this.isAuthenticated()) {
      void this.auth.login({ returnTo: this.router.url });
      return;
    }

    if (
      this.currentUserSubscription()?.subscriptionStatus === 'CONFIRMED' &&
      !this.needsImageLicenseAgreement() &&
      !this.decisions().includesEvents
    ) {
      const successRoute = subscriptionSuccessRoute(data.majorEvent, this.selectedPriceTier());
      if (successRoute) {
        void this.router.navigate(successRoute.commands, { queryParams: successRoute.queryParams });
      }
      return;
    }

    if (this.subscriptionCooldownSeconds() > 0) {
      this.snackBar.open(`Aguarde ${this.subscriptionCooldownSeconds()}s para alterar a inscrição.`, 'OK', {
        duration: 3000,
      });
      return;
    }

    this.isPreparingSubscriptionFlow.set(true);
    this.loadSubscriptionForms(data, rankedEventIds)
      .pipe(
        catchError(() => {
          this.snackBar.open('Não foi possível carregar os formulários da inscrição.', 'OK', {
            duration: 5000,
          });
          return EMPTY;
        }),
        finalize(() => this.isPreparingSubscriptionFlow.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((forms) => {
        const draft = createSubscriptionFlowDraft(
          forms,
          this.currentUserSubscription()?.imageLicenseAgreementAccepted === true,
          this.subscriptionFlowDraft(),
        );
        const flow: RankedSubscriptionFormFlow = {
          eventIds: rankedEventIds,
          events: rankedEventIds
            .map((eventId) => this.eventsById().get(eventId))
            .filter((event): event is PublicEvent => Boolean(event)),
          forms,
          draft,
          paymentTier: selectedPaymentTier ?? null,
        };
        this.subscriptionFlowDraft.set(draft);

        if (forms.length === 0 && !data.majorEvent.requiresImageLicenseAgreement) {
          this.openReviewDialog(flow);
          return;
        }

        this.subscriptionFormFlow.set(flow);
      });
  }

  returnToRanking(draft: SubscriptionFlowDraft): void {
    this.subscriptionFlowDraft.set(draft);
    this.subscriptionFormFlow.set(null);
  }

  reviewSubscription(draft: SubscriptionFlowDraft): void {
    const flow = this.subscriptionFormFlow();
    if (!flow || this.isSubmitting()) {
      return;
    }

    const nextFlow = { ...flow, draft };
    this.subscriptionFlowDraft.set(draft);
    this.subscriptionFormFlow.set(nextFlow);
    this.openReviewDialog(nextFlow);
  }

  private initializeFromPageData(
    data: PublicMajorEventSubscriptionPage,
    currentUserSubscription: CurrentUserMajorEventSubscription | null,
  ): void {
    const isInitialLoad = this.initializedMajorEventId() !== data.majorEvent.id;
    if (isInitialLoad) {
      this.syncSelectedPriceTier(currentUserSubscription);
    }

    const validEventIds = this.selectableEventIds();
    const selected = this.decisions().includesEvents
      ? new Set([...this.selectedEventIds()].filter((eventId) => validEventIds.has(eventId)))
      : new Set<string>();
    if (this.decisions().includesEvents) {
      for (const eventId of this.autoSelectedEventIds()) {
        selected.add(eventId);
      }
    }

    if (isInitialLoad && this.decisions().includesEvents) {
      for (const event of currentUserSubscription?.selectedEvents ?? []) {
        if (validEventIds.has(event.id)) {
          selected.add(event.id);
        }
      }
    }
    if (isInitialLoad) {
      this.initializedMajorEventId.set(data.majorEvent.id);
    }

    if (!this.setsEqual(this.selectedEventIds(), selected)) {
      this.selectedEventIds.set(selected);
    }
    this.syncRankedItems();
    this.syncDesiredDefaults();
  }

  private syncSelectedPriceTier(currentUserSubscription: CurrentUserMajorEventSubscription | null): void {
    const tierNames = new Set(this.priceTiers().map((tier) => tier.name));
    const currentTier = currentUserSubscription?.paymentTier ?? this.selectedPriceTierName();
    if (currentTier && tierNames.has(currentTier) && currentTier !== this.selectedPriceTierName()) {
      this.selectedPriceTierName.set(currentTier);
    } else if (!currentTier && this.priceTiers().length === 1) {
      this.selectedPriceTierName.set(this.priceTiers()[0].name);
    }
  }

  private confirmSubscription(
    data: PublicMajorEventSubscriptionPage,
    eventIds: string[],
    paymentTier: string | null,
    formAnswers: SubscriptionFormAnswer[],
    imageLicenseAgreementAccepted: boolean,
  ): void {
    if (this.isSubmitting()) {
      return;
    }

    if (this.subscriptionCooldownSeconds() > 0) {
      this.snackBar.open(`Aguarde ${this.subscriptionCooldownSeconds()}s para alterar a inscrição.`, 'OK', {
        duration: 3000,
      });
      return;
    }

    this.isSubmitting.set(true);
    this.api
      .upsertRankedSubscription(
        data.majorEvent.id,
        eventIds,
        {
          desiredCourses: this.desiredCourses(),
          desiredLectures: this.desiredLectures(),
          desiredUncategorized: this.desiredUncategorized(),
        },
        paymentTier,
        toSubmitSubscriptionFormResponses(formAnswers),
        imageLicenseAgreementAccepted,
      )
      .pipe(
        finalize(() => this.isSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (subscription) => {
          const action = this.currentUserSubscription() ? 'updated' : 'created';
          this.currentUserSubscription.set(subscription);
          this.subscriptionFormFlow.set(null);
          this.subscriptionFlowDraft.set(null);
          this.analytics.trackMajorEventSubscription({
            action,
            majorEvent: data.majorEvent,
            subscription,
            selectedEventCount: eventIds.length,
            paymentTier,
            priceInCents: this.selectedPriceTier()?.value ?? null,
            ranked: true,
          });
          this.snackBar.open('Inscrição realizada.', 'OK', { duration: 3000 });
          if (this.imageLicenseAgreementQueryRequested()) {
            void this.router.navigate([], {
              relativeTo: this.route,
              queryParams: { requireImageLicenseAgreement: null },
              queryParamsHandling: 'merge',
              replaceUrl: true,
            });
          }
          const successRoute = subscriptionSuccessRoute(data.majorEvent, this.selectedPriceTier());
          if (successRoute) {
            void this.router.navigate(successRoute.commands, { queryParams: successRoute.queryParams });
          }
        },
        error: (error: unknown) => {
          if (error instanceof RateLimitError) {
            this.subscriptionCooldown.start(error.retryAfterSeconds);
          }
          this.snackBar.open(error instanceof Error ? error.message : 'Não foi possível concluir a inscrição.', 'OK', {
            duration: 5000,
          });
        },
      });
  }

  private openReviewDialog(flow: RankedSubscriptionFormFlow): void {
    const data = this.data();
    if (!data || this.isSubmitting()) {
      return;
    }

    const dialogRef = this.dialog.open<
      SubscriptionReviewDialog,
      SubscriptionReviewDialogData,
      SubscriptionReviewDialogResult
    >(SubscriptionReviewDialog, {
      data: {
        majorEvent: data.majorEvent,
        events: flow.events,
        forms: flow.forms,
        draft: flow.draft,
        paymentTier: flow.paymentTier,
        requireImageLicenseAgreement: Boolean(data.majorEvent.requiresImageLicenseAgreement),
      },
      width: 'min(680px, 96vw)',
      maxHeight: '90vh',
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result?.confirmed) {
          this.confirmSubscription(
            data,
            flow.eventIds,
            flow.paymentTier,
            toSubscriptionFormAnswers(flow.forms, flow.draft),
            flow.draft.imageLicenseAgreementAccepted,
          );
        }
      });
  }

  private loadSubscriptionForms(data: PublicMajorEventSubscriptionPage, eventIds: readonly string[]) {
    const events = eventIds
      .map((eventId) => this.eventsById().get(eventId))
      .filter((event): event is PublicEvent => Boolean(event));
    return this.formFlow.loadForms(
      createMajorEventSubscriptionFlowSources(data.majorEvent, events),
      this.selectedPriceTier()?.id ?? null,
    );
  }

  private computeDisabledReasons(): ReadonlyMap<string, string> {
    const reasons = new Map<string, string>();
    const now = new Date();
    for (const event of this.sortedEvents()) {
      if (this.effectiveSelectedEventIds().has(event.id)) {
        continue;
      }
      const summary = this.summariesByEventId().get(event.id);
      if (summary && !summary.hasAvailableSlots) {
        reasons.set(event.id, 'Sem vagas disponíveis.');
      } else if (!isBefore(now, parseISO(event.startDate))) {
        reasons.set(event.id, 'Evento já iniciado.');
      }
    }
    return reasons;
  }

  private syncRankedItems(): void {
    if (!this.decisions().includesEvents) {
      this.rankingItems.set([]);
      this.notWantedItems.set([]);
      return;
    }
    const currentRankingKeys = new Set(this.rankingItems().map((item) => item.key));
    const allItems = this.buildRankedItems();
    const selectedKeys = new Set(
      allItems
        .filter((item) => item.eventIds.some((eventId) => this.effectiveSelectedEventIds().has(eventId)))
        .map((item) => item.key),
    );
    const automaticEventIds = this.autoSelectedEventIds();
    const autoKeys = new Set(
      allItems
        .filter((item) => item.eventIds.every((eventId) => automaticEventIds.has(eventId)))
        .map((item) => item.key),
    );
    const nextRanking = [
      ...this.rankingItems()
        .filter((item) => selectedKeys.has(item.key) && !autoKeys.has(item.key))
        .map((item) => allItems.find((nextItem) => nextItem.key === item.key) ?? item),
      ...allItems.filter(
        (item) => selectedKeys.has(item.key) && !autoKeys.has(item.key) && !currentRankingKeys.has(item.key),
      ),
    ];
    const nextRankingKeys = new Set(nextRanking.map((item) => item.key));
    this.rankingItems.set(nextRanking);
    this.notWantedItems.set(allItems.filter((item) => !autoKeys.has(item.key) && !nextRankingKeys.has(item.key)));
  }

  private buildRankedItems(): RankedItem[] {
    const itemsByKey = new Map<string, RankedItem>();
    for (const event of this.sortedEvents()) {
      const key = event.eventGroupId ?? event.id;
      const existing = itemsByKey.get(key);
      if (existing) {
        existing.events.push(event);
        existing.eventIds.push(event.id);
      } else {
        const eventGroup = event.eventGroup;
        itemsByKey.set(key, {
          key,
          label: eventGroup?.name ?? event.name,
          emoji: eventGroup?.emoji ?? event.emoji,
          type: event.type,
          eventIds: [event.id],
          events: [event],
        });
      }
    }
    return [...itemsByKey.values()];
  }

  private syncDesiredDefaults(): void {
    if (!this.decisions().includesEvents) {
      this.desiredCourses.set(0);
      this.desiredLectures.set(0);
      this.desiredUncategorized.set(0);
      return;
    }
    this.desiredCourses.set(this.clampDesired(this.desiredCourses(), 'course'));
    this.desiredLectures.set(this.clampDesired(this.desiredLectures(), 'lecture'));
    this.desiredUncategorized.set(this.clampDesired(this.desiredUncategorized(), 'uncategorized'));
  }

  private clampDesired(value: number, category: RankedCategory): number {
    const options = this.categoryOptions(category);
    const minimum = options[0] ?? 0;
    const maximum = options.at(-1) ?? minimum;
    return Math.max(minimum, Math.min(value, maximum));
  }

  private categoryOptions(category: RankedCategory): number[] {
    const events = this.sortedEvents().filter((event) => this.eventCategory(event) === category);
    const automaticEventIds = this.autoSelectedEventIds();
    const autoCount = events.filter((event) => automaticEventIds.has(event.id)).length;
    const configuredMax = this.configuredMax(category);
    const maximum = Math.max(
      autoCount,
      configuredMax === null ? events.length : Math.min(configuredMax, events.length),
    );
    return Array.from({ length: maximum - autoCount + 1 }, (_, index) => index + autoCount);
  }

  private configuredMax(category: RankedCategory): number | null {
    return this.effectiveCategoryLimits()[category];
  }

  private eventCategory(event: PublicEvent): RankedCategory {
    if (event.type === 'MINICURSO') {
      return 'course';
    }
    if (event.type === 'PALESTRA') {
      return 'lecture';
    }
    return 'uncategorized';
  }

  private getEventIdsForStepOneToggle(event: PublicEvent): string[] {
    return event.eventGroupId
      ? this.sortedEvents()
          .filter((item) => item.eventGroupId === event.eventGroupId)
          .map((item) => item.id)
      : [event.id];
  }

  private setDropListItems(id: string, items: RankedItem[]): void {
    if (id === 'ranking-list') {
      this.rankingItems.set(items);
    } else {
      this.notWantedItems.set(items);
    }
  }

  private resolveSelectedPaymentTier(data: PublicMajorEventSubscriptionPage): string | null | undefined {
    const tiers = data.majorEvent.majorEventPrices?.flatMap((price) => price.tiers) ?? [];
    if (tiers.length === 0) {
      return null;
    }
    if (tiers.length === 1) {
      return tiers[0].name;
    }
    return this.selectedPriceTier()?.name;
  }

  private applyRealtimeDelta(delta: MajorEventSubscriptionRealtimeDelta): void {
    const currentState = this.pageState();
    if (currentState.status !== 'ready') {
      this.pendingRealtimeDelta.set(delta);
      return;
    }
    this.pendingRealtimeDelta.set(null);
    this.pageState.set({ status: 'ready', data: this.mergeRealtimeDelta(currentState.data, delta) });
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
    return { ...data, subscriptionSummaries: [...summariesByEventId.values()] };
  }

  private setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
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
}
