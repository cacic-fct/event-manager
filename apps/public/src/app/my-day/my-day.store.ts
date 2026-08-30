import { DestroyRef, Service, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '@cacic-fct/shared-angular';
import type { CurrentUserMyDay } from '@cacic-fct/event-manager-public-contracts';
import { MyDayCacheService } from '@cacic-fct/public-indexed-db';
import { Subject, firstValueFrom, filter, takeUntil } from 'rxjs';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
import { RateLimitError, createRateLimitCooldown } from '../shared/rate-limit-error';
import { NetworkStatusService } from '../shared/network-status.service';
import { MyDayApiService } from './my-day-api.service';
import { myDayDateKey } from './my-day-date';
import { RealtimeInvalidationService } from '../shared/realtime-invalidation.service';

export type MyDayLoadState =
  | { status: 'idle'; data: null; offline: boolean }
  | { status: 'loading'; data: CurrentUserMyDay | null; offline: boolean }
  | { status: 'ready'; data: CurrentUserMyDay; offline: boolean }
  | { status: 'error'; data: CurrentUserMyDay | null; offline: boolean; message: string };

@Service()
export class MyDayStore {
  private readonly api = inject(MyDayApiService);
  private readonly auth = inject(AuthService);
  private readonly cache = inject(MyDayCacheService);
  private readonly network = inject(NetworkStatusService);
  private readonly featureFlags = inject(PublicFeatureFlagService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly realtime = inject(RealtimeInvalidationService);
  private readonly stateSignal = signal<MyDayLoadState>({ status: 'idle', data: null, offline: false });
  private readonly selectedDateSignal = signal(myDayDateKey(new Date()));
  private readonly availableSignal = signal<boolean | null>(null);
  private readonly requestCancellation = new Subject<void>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly cooldown = createRateLimitCooldown(this.destroyRef);
  private requestVersion = 0;
  private started = false;
  private activeContextKey: string | null = null;

  readonly state = this.stateSignal.asReadonly();
  readonly selectedDate = this.selectedDateSignal.asReadonly();
  readonly hasAvailableContent = this.availableSignal.asReadonly();
  readonly cooldownSeconds = this.cooldown.seconds;
  readonly data = computed(() => this.stateSignal().data);

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    effect(() => {
      const userId = this.auth.user()?.sub;
      const enabled = this.featureFlags.booleanValue('myDayTabEnabled');
      const contextKey = userId && enabled ? userId : null;
      if (contextKey !== this.activeContextKey) {
        this.activeContextKey = contextKey;
        this.requestVersion += 1;
        this.requestCancellation.next();
        this.inFlight.clear();
        this.cooldown.clear();
        this.availableSignal.set(contextKey ? null : false);
        this.stateSignal.set({ status: 'idle', data: null, offline: !this.network.isOnline() });
      }
      if (!userId || !enabled) {
        return;
      }
      void this.warmInitialDates(userId);
    });

    this.network
      .watchStatusChanges()
      .pipe(
        filter((status) => status === 'online'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => void this.load(this.selectedDateSignal(), true));

    this.realtime
      .watchCurrentUserData()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.load(this.selectedDateSignal(), true));
    this.realtime
      .watchCatalog()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.load(this.selectedDateSignal(), true));
  }

  async load(date: string, force = false): Promise<void> {
    const userId = this.auth.user()?.sub;
    if (!userId || !this.featureFlags.booleanValue('myDayTabEnabled')) {
      return;
    }
    this.selectedDateSignal.set(date);
    const requestKey = `${userId}:${date}`;
    const existing = this.inFlight.get(requestKey);
    if (existing && !force) {
      await existing;
      return;
    }

    const request = this.loadDate(userId, date, force);
    this.inFlight.set(requestKey, request);
    try {
      await request;
    } finally {
      if (this.inFlight.get(requestKey) === request) {
        this.inFlight.delete(requestKey);
      }
    }
  }

  private async loadDate(userId: string, date: string, force: boolean): Promise<void> {
    const requestVersion = ++this.requestVersion;
    const cached = await this.cache.get(userId, date);
    if (!this.isCurrentRequest(requestVersion, userId)) {
      return;
    }
    if (cached) {
      this.stateSignal.set({ status: 'ready', data: cached, offline: !this.network.isOnline() });
      if (date === myDayDateKey(new Date())) {
        this.availableSignal.set(cached.hasContent);
      }
    } else {
      this.stateSignal.set({ status: 'loading', data: null, offline: !this.network.isOnline() });
    }
    if (!this.network.isOnline()) {
      if (!cached) {
        this.stateSignal.set({
          status: 'error',
          data: null,
          offline: true,
          message: 'Este dia ainda não está disponível off-line.',
        });
      }
      return;
    }
    if (cached && !force && Date.now() - new Date(cached.generatedAt).getTime() < 60_000) {
      return;
    }
    try {
      this.requestCancellation.next();
      const data = await firstValueFrom(this.api.get(date).pipe(takeUntil(this.requestCancellation)));
      if (!this.isCurrentRequest(requestVersion, userId)) {
        return;
      }
      await this.cache.put(userId, data);
      if (!this.isCurrentRequest(requestVersion, userId)) {
        return;
      }
      this.cooldown.clear();
      this.stateSignal.set({ status: 'ready', data, offline: false });
      if (date === myDayDateKey(new Date())) {
        this.availableSignal.set(data.hasContent);
      }
    } catch (error: unknown) {
      if (!this.isCurrentRequest(requestVersion, userId)) {
        return;
      }
      if (error instanceof RateLimitError) {
        this.cooldown.start(error.retryAfterSeconds);
      }
      this.stateSignal.set({
        status: 'error',
        data: cached,
        offline: false,
        message: error instanceof Error ? error.message : 'Não foi possível atualizar seu dia.',
      });
    }
  }

  refresh(): Promise<void> {
    return this.load(this.selectedDateSignal(), true);
  }

  private async warmInitialDates(userId: string): Promise<void> {
    const today = myDayDateKey(new Date());
    const cachedToday = await this.cache.get(userId, today);
    if (this.auth.user()?.sub !== userId || !this.featureFlags.booleanValue('myDayTabEnabled')) {
      return;
    }
    if (cachedToday) {
      this.availableSignal.set(cachedToday.hasContent);
    }
    if (this.selectedDateSignal() === today) {
      await this.load(today);
    }
  }

  private isCurrentRequest(requestVersion: number, userId: string): boolean {
    return requestVersion === this.requestVersion && this.auth.user()?.sub === userId;
  }
}
