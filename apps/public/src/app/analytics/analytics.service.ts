import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, effect, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService, type AuthenticatedUser } from '@cacic-fct/shared-angular';
import { UmamiService } from '@cacic-fct/ngx-umami';
import type { UmamiEventData, UmamiIdentifyData } from '@cacic-fct/ngx-umami';
import type { CurrentUserMajorEventSubscription, PublicMajorEvent } from '@cacic-fct/shared-utils';
import { filter } from 'rxjs';
import {
  isUserAnalyticsEnabled,
  isUserDiagnosticsEnabled,
  isUserPerformanceMonitoringEnabled,
  readUserPrivacyFlag,
} from '../privacy/privacy-attributes';

type AnalyticsEventData = Record<string, string | number | boolean | null | undefined>;

const MAX_PENDING_ACTIONS = 50;
const FLUSH_INTERVAL_MS = 250;
const MAX_FLUSH_ATTEMPTS = 40;

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly umami = inject(UmamiService);

  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private pendingActions: Array<() => void> = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushAttempts = 0;
  private identifiedUserId: string | null = null;
  private started = false;
  private lastTrackedUrl: string | null = null;

  constructor() {
    effect(() => {
      const user = this.auth.user();
      this.syncIdentifiedUser(user);
    });
  }

  start(): void {
    if (!this.isBrowser || this.started) {
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
    this.enqueue(() => this.umami.trackEvent(eventName, this.normalizeEventData(eventData)));
  }

  trackMajorEventSubscription(input: {
    action: 'created' | 'updated';
    majorEvent: PublicMajorEvent;
    subscription: CurrentUserMajorEventSubscription;
    selectedEventCount: number;
    paymentTier?: string | null;
    priceInCents?: number | null;
    ranked?: boolean;
  }): void {
    const amountInCents = input.subscription.amountPaid ?? input.priceInCents ?? null;
    const amount = amountInCents == null ? null : amountInCents / 100;

    this.trackEvent('major_event_subscription', {
      action: input.action,
      major_event_id: input.majorEvent.id,
      major_event_name: input.majorEvent.name,
      subscription_id: input.subscription.id,
      subscription_status: input.subscription.subscriptionStatus,
      payment_required: Boolean(input.majorEvent.isPaymentRequired),
      payment_tier: input.subscription.paymentTier ?? input.paymentTier ?? null,
      selected_event_count: input.selectedEventCount,
      ranked: Boolean(input.ranked),
      amount,
      amount_in_cents: amountInCents,
      currency: amountInCents == null ? null : 'BRL',
    });

    if (input.majorEvent.isPaymentRequired) {
      this.trackMajorEventTransaction({
        stage: 'subscription_created',
        majorEvent: input.majorEvent,
        subscription: input.subscription,
        paymentTier: input.paymentTier,
        priceInCents: input.priceInCents,
      });
    }
  }

  trackMajorEventTransaction(input: {
    stage: 'subscription_created' | 'payment_page_viewed' | 'receipt_uploaded';
    majorEvent: PublicMajorEvent;
    subscription: CurrentUserMajorEventSubscription;
    paymentTier?: string | null;
    priceInCents?: number | null;
  }): void {
    if (!input.majorEvent.isPaymentRequired) {
      return;
    }

    const amountInCents = input.subscription.amountPaid ?? input.priceInCents ?? null;
    this.trackEvent('major_event_transaction', {
      stage: input.stage,
      major_event_id: input.majorEvent.id,
      major_event_name: input.majorEvent.name,
      subscription_id: input.subscription.id,
      subscription_status: input.subscription.subscriptionStatus,
      payment_tier: input.subscription.paymentTier ?? input.paymentTier ?? null,
      amount: amountInCents == null ? null : amountInCents / 100,
      amount_in_cents: amountInCents,
      currency: 'BRL',
    });
  }

  private trackPageView(url: string): void {
    if (this.lastTrackedUrl === url) {
      return;
    }

    this.lastTrackedUrl = url;
    this.enqueue(() => this.umami.trackPageView({ url }));
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
    this.enqueue(() => this.umami.identify(userId, this.buildIdentifyData(user)));
  }

  private enqueue(action: () => void): void {
    if (!this.canTrackCurrentUser()) {
      return;
    }

    if (this.umami.isAvailable()) {
      action();
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

    if (!this.umami.isAvailable()) {
      if (this.flushAttempts >= MAX_FLUSH_ATTEMPTS) {
        this.pendingActions = [];
        this.clearFlushTimer();
      }
      return;
    }

    const actions = this.pendingActions.splice(0);
    for (const action of actions) {
      action();
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

  private canTrackCurrentUser(): boolean {
    if (!this.isBrowser) {
      return false;
    }

    return isUserAnalyticsEnabled(this.auth.user());
  }

  private buildIdentifyData(user: AuthenticatedUser): UmamiIdentifyData {
    return this.normalizeEventData({
      authenticated: true,
      has_email: Boolean(user.email),
      analytics_enabled: readUserPrivacyFlag(user, 'analytics_enabled') ?? true,
      diagnostics_enabled: isUserDiagnosticsEnabled(user),
      performance_monitoring_enabled: isUserPerformanceMonitoringEnabled(user),
    });
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
