import type { PublicMajorEvent, PublicMajorEventPriceTier } from '@cacic-fct/event-manager-public-contracts';

export type RegistrationDecisionStep = 'tier' | 'events';

/** Keep eligibility and step ordering together so both registration modes use the same decisions. */
export function resolveRegistrationDecisions(
  majorEvent: PublicMajorEvent | null,
  tier: PublicMajorEventPriceTier | null,
) {
  const hasTierStep = Boolean(
    majorEvent?.isPaymentRequired && majorEvent.majorEventPrices?.some((price) => price.tiers.length > 0),
  );
  const tierResolved = !hasTierStep || tier !== null;
  const includesEvents = tierResolved && (!hasTierStep || tier?.includesEventRegistration !== false);
  const includesSports = hasTierStep && tier?.includesSportsRegistration === true;
  const steps: RegistrationDecisionStep[] = [
    ...(hasTierStep ? ['tier' as const] : []),
    ...(includesEvents ? ['events' as const] : []),
  ];
  return { hasTierStep, tierResolved, includesEvents, includesSports, steps };
}
