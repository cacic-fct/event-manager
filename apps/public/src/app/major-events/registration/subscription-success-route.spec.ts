import { createPublicMajorEvent } from '@cacic-fct/event-manager-public-testing';
import { subscriptionSuccessRoute } from './subscription-success-route';

describe('subscriptionSuccessRoute', () => {
  const sportsTier = {
    id: 'tier-both',
    name: 'Atividades e torneio',
    value: 7000,
    includesSportsRegistration: true,
  };

  it('continues a sports-enabled tier into the linked tournament before payment', () => {
    const majorEvent = createPublicMajorEvent({
      id: 'major-1',
      isPaymentRequired: true,
      sportsTournament: {
        id: 'tournament-1',
        selfSubscriptionEnabled: true,
        registrationOpen: true,
      },
    });

    expect(subscriptionSuccessRoute(majorEvent, sportsTier)).toEqual({
      commands: ['/tournament', 'tournament-1', 'subscribe'],
      queryParams: {
        paymentTier: 'Atividades e torneio',
        returnUrl: '/major-event/major-1/payment',
      },
    });
  });

  it('keeps event-only tiers in the existing payment flow', () => {
    const majorEvent = createPublicMajorEvent({
      id: 'major-1',
      isPaymentRequired: true,
      sportsTournament: { id: 'tournament-1', selfSubscriptionEnabled: true, registrationOpen: true },
    });

    expect(
      subscriptionSuccessRoute(majorEvent, {
        ...sportsTier,
        id: 'tier-events',
        name: 'Somente atividades',
        includesSportsRegistration: false,
      }),
    ).toEqual({ commands: ['/major-event', 'major-1', 'payment'] });
  });

  it('does not route into a closed tournament registration', () => {
    const majorEvent = createPublicMajorEvent({
      isPaymentRequired: false,
      sportsTournament: { id: 'tournament-1', selfSubscriptionEnabled: true, registrationOpen: false },
    });

    expect(subscriptionSuccessRoute(majorEvent, sportsTier)).toBeNull();
  });
});
