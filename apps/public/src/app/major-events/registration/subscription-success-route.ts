import type { PublicMajorEvent, PublicMajorEventPriceTier } from '@cacic-fct/event-manager-public-contracts';

export interface SubscriptionSuccessRoute {
  commands: string[];
  queryParams?: Record<string, string>;
}

export function subscriptionSuccessRoute(
  majorEvent: PublicMajorEvent,
  selectedTier: PublicMajorEventPriceTier | null,
): SubscriptionSuccessRoute | null {
  const requiresPayment = majorEvent.isPaymentRequired === true && selectedTier?.value !== 0;
  const tournament = majorEvent.sportsTournament;
  if (
    selectedTier?.includesSportsRegistration &&
    tournament?.selfSubscriptionEnabled === true &&
    tournament.registrationOpen === true
  ) {
    return {
      commands: ['/tournament', tournament.id, 'subscribe'],
      queryParams: {
        paymentTier: selectedTier.name,
        ...(requiresPayment ? { returnUrl: `/major-event/${majorEvent.id}/payment` } : {}),
      },
    };
  }

  return requiresPayment ? { commands: ['/major-event', majorEvent.id, 'payment'] } : null;
}
