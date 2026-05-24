import { isPlatformBrowser } from '@angular/common';
import { Injectable, Injector, PLATFORM_ID, effect, inject, isDevMode } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { UmamiService } from '@cacic-fct/ngx-umami';
import type { UmamiEventData, UmamiIdentifyData } from '@cacic-fct/ngx-umami';
import { filter } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CACIC_ANALYTICS_CONFIG } from './observability.config';

export type AnalyticsEventData = Record<string, string | number | boolean | null | undefined>;

const MAX_PENDING_ACTIONS = 50;
const FLUSH_INTERVAL_MS = 250;
const MAX_FLUSH_ATTEMPTS = 40;

@Injectable({ providedIn: 'root' })
export class CacicAnalyticsService {
  private readonly auth = inject(AuthService);
  private readonly config = inject(CACIC_ANALYTICS_CONFIG);
  private readonly injector = inject(Injector);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);

  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private umami: UmamiService | null | undefined;
  private pendingActions: Array<(umami: UmamiService) => void> = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushAttempts = 0;
  private identifiedUserId: string | null = null;
  private started = false;
  private lastTrackedUrl: string | null = null;

  constructor() {
    effect(() => {
      const user = this.currentUser();
      this.syncIdentifiedUser(user);
    });
  }

  start(): void {
    if (!this.isBrowser || this.started || isDevMode()) {
      return;
    }

    this.started = true;
    this.trackPageView(this.router.url);

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.trackPageView(event.urlAfterRedirects);
      });
  }

  trackEvent(eventName: string, eventData?: AnalyticsEventData): void {
    this.enqueue((umami) => umami.trackEvent(eventName, this.normalizeEventData(eventData)));
  }

  private trackPageView(url: string): void {
    if (this.lastTrackedUrl === url) {
      return;
    }

    this.lastTrackedUrl = url;
    this.enqueue((umami) => umami.trackPageView({ url }));
  }

  private syncIdentifiedUser(user: AuthenticatedUser | null): void {
    if (!this.isBrowser) {
      return;
    }

    const userId = user?.sub;
    if (!userId) {
      this.identifiedUserId = null;
      return;
    }

    if (!this.canTrackCurrentUser() || this.identifiedUserId === userId) {
      return;
    }

    this.identifiedUserId = userId;
    this.enqueue((umami) => umami.identify(userId, this.buildIdentifyData(user)));
  }

  private enqueue(action: (umami: UmamiService) => void): void {
    if (!this.canTrackCurrentUser()) {
      return;
    }

    const umami = this.getUmami();
    if (!umami) {
      return;
    }

    if (umami.isAvailable()) {
      action(umami);
      return;
    }

    if (this.pendingActions.length >= MAX_PENDING_ACTIONS) {
      this.pendingActions.shift();
    }
    this.pendingActions.push(action);
    this.ensureFlushTimer();
  }

  private ensureFlushTimer(): void {
    if (this.flushTimer || !this.isBrowser) {
      return;
    }

    this.flushAttempts = 0;
    this.flushTimer = setInterval(() => this.flushPendingActions(), FLUSH_INTERVAL_MS);
  }

  private flushPendingActions(): void {
    this.flushAttempts += 1;

    if (!this.canTrackCurrentUser()) {
      this.pendingActions = [];
      this.clearFlushTimer();
      return;
    }

    const umami = this.getUmami();
    if (!umami || !umami.isAvailable()) {
      if (this.flushAttempts >= MAX_FLUSH_ATTEMPTS) {
        this.pendingActions = [];
        this.clearFlushTimer();
      }
      return;
    }

    const actions = this.pendingActions.splice(0);
    for (const action of actions) {
      action(umami);
    }
    this.clearFlushTimer();
  }

  private clearFlushTimer(): void {
    if (!this.flushTimer) {
      return;
    }

    clearInterval(this.flushTimer);
    this.flushTimer = null;
  }

  private getUmami(): UmamiService | null {
    if (this.umami !== undefined) {
      return this.umami;
    }

    try {
      this.umami = this.injector.get(UmamiService);
    } catch {
      this.umami = null;
    }

    return this.umami;
  }

  private canTrackCurrentUser(): boolean {
    if (!this.isBrowser) {
      return false;
    }

    return this.config.isAnalyticsEnabled(this.currentUser());
  }

  private currentUser(): AuthenticatedUser | null {
    return typeof this.auth.user === 'function' ? this.auth.user() : null;
  }

  private buildIdentifyData(user: AuthenticatedUser): UmamiIdentifyData {
    return this.normalizeEventData(this.config.buildIdentifyData?.(user) ?? {});
  }

  private normalizeEventData(eventData?: AnalyticsEventData): UmamiEventData {
    const normalized: UmamiEventData = {};
    if (!eventData) {
      return normalized;
    }

    for (const [key, value] of Object.entries(eventData).slice(0, 50)) {
      if (value === undefined || value === null) {
        continue;
      }

      if (typeof value === 'string') {
        normalized[key] = value.slice(0, 500);
        continue;
      }

      if (typeof value === 'number') {
        normalized[key] = Number(value.toFixed(4));
        continue;
      }

      normalized[key] = value;
    }

    return normalized;
  }
}
