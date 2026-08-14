import { SubscriptionStatus } from '@prisma/client';
import { isConfirmedSportsOnlySubscription } from './subscriptions.resolver';

describe('isConfirmedSportsOnlySubscription', () => {
  it('allows the first regular-event selection on a confirmed tournament-backed subscription', () => {
    expect(
      isConfirmedSportsOnlySubscription({
        subscriptionStatus: SubscriptionStatus.CONFIRMED,
        selectedEvents: [],
        sportsTournamentParticipants: [{ id: 'participant-1' }],
      }),
    ).toBe(true);
  });

  it('keeps confirmed regular selections immutable', () => {
    expect(
      isConfirmedSportsOnlySubscription({
        subscriptionStatus: SubscriptionStatus.CONFIRMED,
        selectedEvents: [{ id: 'selection-1' }],
        sportsTournamentParticipants: [{ id: 'participant-1' }],
      }),
    ).toBe(false);
  });
});
