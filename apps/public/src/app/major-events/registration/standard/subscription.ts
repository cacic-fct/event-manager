import { CurrencyPipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { AuthService, MarkdownComponent } from '@cacic-fct/shared-angular';
import type { CurrentUserMajorEventSubscription } from '@cacic-fct/shared-utils';
import { compareIsoDateAsc, formatDateRange, getSubscriptionStatusLabel } from '@cacic-fct/shared-utils';
import { areIntervalsOverlapping, isBefore, parseISO } from 'date-fns';
import { EMPTY, catchError, filter, finalize, map } from 'rxjs';
import { EmojiService } from '../../../shared/emoji.service';
import { AnalyticsService } from '../../../analytics/analytics.service';
import { RateLimitError, createRateLimitCooldown } from '../../../shared/rate-limit-error';
import { MajorEventSubscriptionApiService, type PublicMajorEventSubscriptionPage } from '../subscription-api.service';
import { SubscriptionEventList } from './event-list';
import { SubscriptionTierSelection } from '../tier/tier-selection';
import { resolveRegistrationDecisions } from '../tier/registration-decisions';
import { MajorEventSubscriptionRealtimeDelta, MajorEventSubscriptionRealtimeService } from '../realtime.service';
import { subscriptionSuccessRoute } from '../subscription-success-route';
import { SubscriptionFormFlow } from './subscription-form-flow';
import { SubscriptionFormFlowService } from './subscription-form-flow.service';
import {
  createMajorEventSubscriptionFlowSources,
  createSubscriptionFlowDraft,
  toSubmitSubscriptionFormResponses,
  toSubscriptionFormAnswers,
  type SubscriptionFlowDraft,
  type SubscriptionFormAnswer,
  type SubscriptionFormContext,
} from './subscription-flow.models';
import {
  SubscriptionReviewDialog,
  type SubscriptionReviewDialogData,
  type SubscriptionReviewDialogResult,
} from './subscription-review-dialog';

type SubscriptionPageState =
  | { status: 'loading' }
  | { status: 'ready'; data: PublicMajorEventSubscriptionPage }
  | { status: 'error'; message: string };

interface SubscriptionFlowSelection {
  data: PublicMajorEventSubscriptionPage;
  selectedEventIds: string[];
  selectedEvents: PublicEvent[];
  paymentTier: string | null;
}

@Component({
  selector: 'app-subscription',
  imports: [
    MatButtonModule,
    MatChipsModule,
    CurrencyPipe,
    MatDialogModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatToolbarModule,
    MarkdownComponent,
    RouterLink,
    RouterOutlet,
    SubscriptionEventList,
    SubscriptionTierSelection,
    SubscriptionFormFlow,
  ],
  templateUrl: './subscription.html',
  styleUrl: './subscription.css',
})
export class MajorEventSubscription {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly api = inject(MajorEventSubscriptionApiService);
  private readonly analytics = inject(AnalyticsService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly realtime = inject(MajorEventSubscriptionRealtimeService);
  private readonly formFlow = inject(SubscriptionFormFlowService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly subscriptionCooldown = createRateLimitCooldown(this.destroyRef);

  readonly emoji = inject(EmojiService);
  readonly isAuthenticated = this.auth.isAuthenticated;
  readonly isSubmitting = signal(false);
  readonly subscriptionCooldownSeconds = this.subscriptionCooldown.seconds;
  readonly pageState = signal<SubscriptionPageState>({ status: 'loading' });
  readonly currentUserSubscription = signal<CurrentUserMajorEventSubscription | null | undefined>(undefined);
  readonly confirmedSportsOnlySubscription = computed(() => {
    const subscription = this.currentUserSubscription();
    const majorEvent = this.data()?.majorEvent;
    return subscription?.subscriptionStatus === 'CONFIRMED' && subscription.selectedEvents?.length === 0
      && Boolean(majorEvent?.sportsTournament)
      && (!majorEvent?.isPaymentRequired || this.selectedPriceTier()?.includesSportsRegistration === true);
  });
  readonly selectedEventIds = signal<Set<string>>(new Set());
  readonly selectedPriceTierName = signal<string | null>(null);
  readonly flowPhase = signal<'tier' | 'selection' | 'loading-forms' | 'forms'>('tier');
  readonly subscriptionForms = signal<SubscriptionFormContext[]>([]);
  readonly subscriptionFlowDraft = signal<SubscriptionFlowDraft | null>(null);
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
  private readonly subscriptionFlowSelection = signal<SubscriptionFlowSelection | null>(null);
  private readonly pendingRealtimeDelta = signal<MajorEventSubscriptionRealtimeDelta | null>(null);
  private readonly imageLicenseAgreementQueryRequested = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('requireImageLicenseAgreement') === 'true')),
    { initialValue: false },
  );
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
    if (!data || !this.decisions().includesEvents) {
      return [];
    }

    return [...data.events].sort((left, right) => compareIsoDateAsc(left.startDate, right.startDate));
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
    () => this.decisions().includesEvents
      ? new Set([...this.selectedEventIds(), ...this.autoSelectedEventIds()])
      : new Set<string>(),
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

  readonly decisions = computed(() => resolveRegistrationDecisions(this.data()?.majorEvent ?? null, this.selectedPriceTier()));
  readonly showingTierStep = computed(() => this.decisions().hasTierStep && this.flowPhase() === 'tier');

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
      this.flowPhase.set('tier');
      this.subscriptionForms.set([]);
      this.subscriptionFlowDraft.set(null);
      this.subscriptionFlowSelection.set(null);
      this.agreementFlowAutoStartAttempted.set(false);
      this.subscriptionCooldown.clear();

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
        const tiers = untracked(() => this.priceTiers());
        const initialTier = tiers.find((tier) => tier.name === currentUserSubscription?.paymentTier)
          ?? (tiers.length === 1 ? tiers[0] : null);
        this.selectedPriceTierName.set(initialTier?.name ?? null);
        this.flowPhase.set(data.majorEvent.isPaymentRequired && tiers.length > 0 ? 'tier' : 'selection');
        this.initializedMajorEventId.set(majorEventId);
      }

      if (!this.setsEqual(this.selectedEventIds(), nextSelected)) {
        this.selectedEventIds.set(nextSelected);
      }
    });

    effect(() => {
      if (
        !this.imageLicenseAgreementQueryRequested() ||
        !this.needsImageLicenseAgreement() ||
        !this.data() ||
        this.initializedMajorEventId() !== this.data()?.majorEvent.id ||
        (this.flowPhase() !== 'selection' && this.flowPhase() !== 'tier') ||
        this.agreementFlowAutoStartAttempted()
      ) {
        return;
      }

      this.agreementFlowAutoStartAttempted.set(true);
      this.flowPhase.set('selection');
      this.startSubscriptionFlow();
    });
  }

  dateLine(): string {
    const majorEvent = this.data()?.majorEvent;
    return majorEvent ? formatDateRange(majorEvent.startDate, majorEvent.endDate) : '';
  }

  submitButtonIcon(): string {
    if (this.needsImageLicenseAgreement()) {
      return 'verified_user';
    }

    const subscription = this.currentUserSubscription();
    if (subscription?.subscriptionStatus === 'CONFIRMED') {
      return 'check';
    }
    return subscription ? 'edit' : 'arrow_forward';
  }

  submitButtonLabel(): string {
    if (this.needsImageLicenseAgreement()) {
      return 'Continuar para o contrato';
    }

    const subscription = this.currentUserSubscription();
    if (subscription?.subscriptionStatus === 'CONFIRMED') {
      return 'Inscrito';
    }
    return 'Continuar';
  }

  toggleEvent(event: PublicEvent): void {
    if (!this.decisions().includesEvents || this.showingTierStep() || this.autoSelectedEventIds().has(event.id)) {
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

  startSubscriptionFlow(): void {
    const data = this.data();
    if (
      !data ||
      this.currentUserSubscription() === undefined ||
      this.isSubmitting() ||
      this.flowPhase() === 'loading-forms' ||
      this.showingTierStep()
    ) {
      return;
    }

    if (this.currentUserSubscription()?.subscriptionStatus === 'CONFIRMED'
      && !this.confirmedSportsOnlySubscription() && !this.needsImageLicenseAgreement()) return;

    if (this.decisions().includesEvents && this.selectedEvents().length === 0) {
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

    const selectedEvents = this.selectedEvents();
    this.subscriptionFlowSelection.set({
      data,
      selectedEventIds: [...this.effectiveSelectedEventIds()],
      selectedEvents,
      paymentTier: selectedPaymentTier ?? null,
    });
    this.flowPhase.set('loading-forms');

    this.formFlow
      .loadForms(
        createMajorEventSubscriptionFlowSources(data.majorEvent, selectedEvents),
        this.selectedPriceTier()?.id ?? null,
      )
      .pipe(
        catchError(() => {
          this.snackBar.open('Não foi possível carregar os formulários da inscrição.', 'OK', {
            duration: 5000,
          });
          this.flowPhase.set('selection');
          return EMPTY;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((forms) => {
        const draft = createSubscriptionFlowDraft(
          forms,
          this.currentUserSubscription()?.imageLicenseAgreementAccepted === true,
          this.subscriptionFlowDraft(),
        );
        this.subscriptionForms.set(forms);
        this.subscriptionFlowDraft.set(draft);

        if (forms.length === 0 && !data.majorEvent.requiresImageLicenseAgreement) {
          this.flowPhase.set('selection');
          this.openReviewDialog(draft);
          return;
        }

        this.flowPhase.set('forms');
      });
  }

  returnToSelection(draft: SubscriptionFlowDraft): void {
    this.subscriptionFlowDraft.set(draft);
    this.flowPhase.set(this.decisions().includesEvents ? 'selection' : 'tier');
    this.focusStep();
  }

  reviewSubscription(draft: SubscriptionFlowDraft): void {
    if (this.isSubmitting()) {
      return;
    }
    this.subscriptionFlowDraft.set(draft);
    this.openReviewDialog(draft);
  }

  selectPriceTier(tierName: string): void {
    if (!this.priceTiers().some((tier) => tier.name === tierName) || this.isSubmitting() || this.currentUserSubscription()?.subscriptionStatus === 'CONFIRMED') return;
    if (tierName !== this.selectedPriceTierName()) {
      this.selectedPriceTierName.set(tierName);
      this.selectedEventIds.set(new Set());
      this.subscriptionForms.set([]);
      this.subscriptionFlowDraft.set(null);
      this.subscriptionFlowSelection.set(null);
    }
  }

  continueFromTier(): void {
    const data = this.data();
    if (!data || !this.decisions().tierResolved || this.currentUserSubscription() === undefined || this.isSubmitting()) return;
    this.flowPhase.set('selection');
    if (!this.decisions().includesEvents) {
      if (this.currentUserSubscription()?.subscriptionStatus === 'CONFIRMED' && !this.needsImageLicenseAgreement()) {
        const route = subscriptionSuccessRoute(data.majorEvent, this.selectedPriceTier());
        if (route) void this.router.navigate(route.commands, { queryParams: route.queryParams });
      } else {
        this.startSubscriptionFlow();
      }
    }
    this.focusStep();
  }

  returnToTier(): void {
    if (this.isSubmitting()) return;
    this.flowPhase.set('tier');
    this.focusStep();
  }

  private focusStep(): void {
    // Defer until Angular has rendered the new page-level step; no browser globals during SSR.
    setTimeout(() => this.element.nativeElement.querySelector<HTMLElement>('[data-step-title], #tier-selection-title')?.focus());
  }

  private confirmSubscription(
    data: PublicMajorEventSubscriptionPage,
    selectedEventIds: string[],
    selectedEvents: PublicEvent[],
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
      .upsertSubscription(
        data.majorEvent.id,
        selectedEventIds,
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
          this.flowPhase.set('selection');
          this.subscriptionForms.set([]);
          this.subscriptionFlowDraft.set(null);
          this.analytics.trackMajorEventSubscription({
            action,
            majorEvent: data.majorEvent,
            subscription,
            selectedEventCount: selectedEvents.length,
            paymentTier,
            priceInCents: this.selectedPriceTier()?.value ?? null,
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

  private openReviewDialog(draft: SubscriptionFlowDraft): void {
    if (this.isSubmitting()) {
      return;
    }

    const selection = this.subscriptionFlowSelection();
    if (!selection) {
      return;
    }

    const { data, selectedEvents, selectedEventIds, paymentTier } = selection;
    const dialogRef = this.dialog.open<
      SubscriptionReviewDialog,
      SubscriptionReviewDialogData,
      SubscriptionReviewDialogResult
    >(SubscriptionReviewDialog, {
      data: {
        majorEvent: data.majorEvent,
        events: selectedEvents,
        forms: this.subscriptionForms(),
        draft,
        paymentTier,
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
            selectedEventIds,
            selectedEvents,
            paymentTier,
            toSubscriptionFormAnswers(this.subscriptionForms(), draft),
            draft.imageLicenseAgreementAccepted,
          );
        }
      });
  }

  private computeDisabledReasons(): ReadonlyMap<string, string> {
    const reasons = new Map<string, string>();
    const data = this.data();
    if (!data) {
      return reasons;
    }

    const now = new Date();
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

      if (!isBefore(now, parseISO(event.startDate))) {
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
      areIntervalsOverlapping(
        { start: parseISO(left.startDate), end: parseISO(left.endDate) },
        { start: parseISO(right.startDate), end: parseISO(right.endDate) },
      )
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
