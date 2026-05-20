import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import type { CurrentUserMajorEventSubscription, EventType, PublicEvent } from '@cacic-fct/shared-utils';
import { formatDateRange, getEventTypeLabel, getSubscriptionStatusLabel } from '@cacic-fct/shared-utils';
import { finalize, map } from 'rxjs';
import { ConfirmSubscriptionDialog, type ConfirmSubscriptionDialogData } from './confirm-subscription-dialog';
import { MajorEventSubscriptionApiService, type PublicMajorEventSubscriptionPage } from './subscription-api.service';
import {
  MajorEventSubscriptionRealtimeDelta,
  MajorEventSubscriptionRealtimeService,
} from './subscription-realtime.service';

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

@Injectable()
export class RankedSubscriptionStore {
  private readonly api = inject(MajorEventSubscriptionApiService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly realtime = inject(MajorEventSubscriptionRealtimeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly isAuthenticated = this.auth.isAuthenticated;
  readonly isSubmitting = signal(false);
  readonly pageState = signal<RankedSubscriptionPageState>({ status: 'loading' });
  readonly currentUserSubscription = signal<CurrentUserMajorEventSubscription | null | undefined>(undefined);
  readonly selectedEventIds = signal<ReadonlySet<string>>(new Set());
  readonly rankingItems = signal<RankedItem[]>([]);
  readonly notWantedItems = signal<RankedItem[]>([]);
  readonly selectedPriceTierName = signal<string | null>(null);
  readonly desiredCourses = signal(0);
  readonly desiredLectures = signal(0);
  readonly desiredUncategorized = signal(0);

  private readonly initializedMajorEventId = signal<string | null>(null);
  private readonly pendingRealtimeDelta = signal<MajorEventSubscriptionRealtimeDelta | null>(null);

  readonly majorEventId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('majorEventId') ?? params.get('eventID') ?? '')),
    { initialValue: this.route.snapshot.paramMap.get('majorEventId') ?? '' },
  );

  readonly data = computed(() => {
    const state = this.pageState();
    return state.status === 'ready' ? state.data : null;
  });

  readonly sortedEvents = computed(() =>
    [...(this.data()?.events ?? [])].sort((left, right) => Date.parse(left.startDate) - Date.parse(right.startDate)),
  );
  readonly eventsById = computed(() => new Map(this.sortedEvents().map((event) => [event.id, event])));
  readonly summariesByEventId = computed(
    () => new Map(this.data()?.subscriptionSummaries.map((summary) => [summary.eventId, summary]) ?? []),
  );
  readonly autoSelectedEventIds = computed(
    () => new Set(this.sortedEvents().filter((event) => event.autoSubscribe).map((event) => event.id)),
  );
  readonly effectiveSelectedEventIds = computed(
    () => new Set([...this.selectedEventIds(), ...this.autoSelectedEventIds()]),
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
        this.pendingRealtimeDelta.set(null);
        this.selectedPriceTierName.set(null);
      });

      const initialSubscription = this.api.getSubscriptionPage(majorEventId).subscribe({
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
    if (this.autoSelectedEventIds().has(event.id)) {
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
      queryParams: { returnUrl: this.router.url },
    });
  }

  drop(event: CdkDragDrop<RankedItem[]>): void {
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
    this.selectedPriceTierName.set(tierName);
  }

  submit(): void {
    const data = this.data();
    if (!data || this.isSubmitting()) {
      return;
    }

    const rankedEventIds = [...this.autoSelectedEventIds(), ...this.rankingItems().flatMap((item) => item.eventIds)];
    if (rankedEventIds.length === 0) {
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

    const dialogRef = this.dialog.open<ConfirmSubscriptionDialog, ConfirmSubscriptionDialogData, boolean>(
      ConfirmSubscriptionDialog,
      {
        data: {
          majorEvent: data.majorEvent,
          events: rankedEventIds.map((eventId) => this.eventsById().get(eventId)).filter((event): event is PublicEvent => Boolean(event)),
        },
        width: 'min(720px, 96vw)',
      },
    );

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (confirmed) {
          this.confirmSubscription(data, rankedEventIds, selectedPaymentTier ?? null);
        }
      });
  }

  private initializeFromPageData(
    data: PublicMajorEventSubscriptionPage,
    currentUserSubscription: CurrentUserMajorEventSubscription | null,
  ): void {
    const validEventIds = new Set(data.events.map((event) => event.id));
    const selected = new Set([...this.selectedEventIds()].filter((eventId) => validEventIds.has(eventId)));
    for (const eventId of this.autoSelectedEventIds()) {
      selected.add(eventId);
    }

    if (this.initializedMajorEventId() !== data.majorEvent.id) {
      for (const event of currentUserSubscription?.selectedEvents ?? []) {
        if (validEventIds.has(event.id)) {
          selected.add(event.id);
        }
      }
      this.initializedMajorEventId.set(data.majorEvent.id);
    }

    if (!this.setsEqual(this.selectedEventIds(), selected)) {
      this.selectedEventIds.set(selected);
    }
    this.syncRankedItems();
    this.syncDesiredDefaults();
    this.syncSelectedPriceTier(currentUserSubscription);
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

  private confirmSubscription(data: PublicMajorEventSubscriptionPage, eventIds: string[], paymentTier: string | null): void {
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
      )
      .pipe(
        finalize(() => this.isSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (subscription) => {
          this.currentUserSubscription.set(subscription);
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
    const now = Date.now();
    for (const event of this.sortedEvents()) {
      if (this.effectiveSelectedEventIds().has(event.id)) {
        continue;
      }
      const summary = this.summariesByEventId().get(event.id);
      if (summary && !summary.hasAvailableSlots) {
        reasons.set(event.id, 'Sem vagas disponíveis.');
      } else if (Date.parse(event.startDate) <= now) {
        reasons.set(event.id, 'Evento já iniciado.');
      }
    }
    return reasons;
  }

  private syncRankedItems(): void {
    const currentRankingKeys = new Set(this.rankingItems().map((item) => item.key));
    const allItems = this.buildRankedItems();
    const selectedKeys = new Set(
      allItems
        .filter((item) => item.eventIds.some((eventId) => this.effectiveSelectedEventIds().has(eventId)))
        .map((item) => item.key),
    );
    const autoKeys = new Set(
      allItems.filter((item) => item.events.every((event) => event.autoSubscribe)).map((item) => item.key),
    );
    const nextRanking = [
      ...this.rankingItems()
        .filter((item) => selectedKeys.has(item.key) && !autoKeys.has(item.key))
        .map((item) => allItems.find((nextItem) => nextItem.key === item.key) ?? item),
      ...allItems.filter((item) => selectedKeys.has(item.key) && !autoKeys.has(item.key) && !currentRankingKeys.has(item.key)),
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
        itemsByKey.set(key, {
          key,
          label: event.eventGroup?.name ?? event.name,
          emoji: event.eventGroup?.emoji ?? event.emoji,
          type: event.type,
          eventIds: [event.id],
          events: [event],
        });
      }
    }
    return [...itemsByKey.values()];
  }

  private syncDesiredDefaults(): void {
    this.desiredCourses.set(this.clampDesired(this.desiredCourses(), 'course'));
    this.desiredLectures.set(this.clampDesired(this.desiredLectures(), 'lecture'));
    this.desiredUncategorized.set(this.clampDesired(this.desiredUncategorized(), 'uncategorized'));
  }

  private clampDesired(value: number, category: RankedCategory): number {
    const options = this.categoryOptions(category);
    const fallback = options.at(-1) ?? 0;
    if (!options.includes(value)) {
      return fallback;
    }
    return value;
  }

  private categoryOptions(category: RankedCategory): number[] {
    const events = this.sortedEvents().filter((event) => this.eventCategory(event) === category);
    const autoCount = events.filter((event) => event.autoSubscribe).length;
    const configuredMax = this.configuredMax(category);
    const max = configuredMax ?? events.length;
    if (events.length > 0 && events.every((event) => event.autoSubscribe)) {
      return [autoCount];
    }
    return Array.from({ length: Math.max(max - autoCount, 0) + 1 }, (_, index) => index + autoCount);
  }

  private configuredMax(category: RankedCategory): number | null {
    const majorEvent = this.data()?.majorEvent;
    if (!majorEvent) {
      return null;
    }
    if (category === 'course') {
      return majorEvent.maxCoursesPerAttendee ?? null;
    }
    if (category === 'lecture') {
      return majorEvent.maxLecturesPerAttendee ?? null;
    }
    return majorEvent.maxUncategorizedPerAttendee ?? null;
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
      ? this.sortedEvents().filter((item) => item.eventGroupId === event.eventGroupId).map((item) => item.id)
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
