import type { PublicMajorEvent, PublicMajorEventPriceTier } from '@cacic-fct/event-manager-public-contracts';

export interface SubscriptionSuccessRoute {
  commands: string[];
  queryParams?: Record<string, string>;
}

export function subscriptionSuccessRoute(
  majorEvent: PublicMajorEvent,
  selectedTier: PublicMajorEventPriceTier | null,
): SubscriptionSuccessRoute | null {
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
        ...(majorEvent.isPaymentRequired
          ? { returnUrl: `/major-event/${majorEvent.id}/payment` }
          : {}),
      },
    };
  }

  return majorEvent.isPaymentRequired
    ? { commands: ['/major-event', majorEvent.id, 'payment'] }
    : null;
}
