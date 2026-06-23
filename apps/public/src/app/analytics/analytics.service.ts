import type { PublicMajorEvent } from '@cacic-fct/event-manager-public-contracts';
import { Injectable } from '@angular/core';
import { CacicAnalyticsService } from '@cacic-fct/shared-angular';
import type { CurrentUserMajorEventSubscription } from '@cacic-fct/shared-utils';

@Injectable({ providedIn: 'root' })
export class AnalyticsService extends CacicAnalyticsService {
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
}
