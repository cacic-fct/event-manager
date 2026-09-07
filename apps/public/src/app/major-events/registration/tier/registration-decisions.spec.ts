import { createPublicMajorEvent } from '@cacic-fct/event-manager-public-testing';
import { resolveRegistrationDecisions } from './registration-decisions';

describe('registration decisions', () => {
  const baseTier = { id: 'tier', name: 'Participante', value: 2500, includesSportsRegistration: false };
  const majorEvent = createPublicMajorEvent({
    isPaymentRequired: true,
    majorEventPrices: [{ id: 'price', type: 'TIERED', tiers: [baseTier] }],
  });

  it.each([
    [true, false, ['tier', 'events']],
    [true, true, ['tier', 'events']],
    [false, true, ['tier']],
    [false, false, ['tier']],
  ])('resolves event access %s and sports access %s', (includesEventRegistration, includesSportsRegistration, steps) => {
    const result = resolveRegistrationDecisions(majorEvent, {
      ...baseTier, includesEventRegistration, includesSportsRegistration,
    });
    expect(result).toEqual({
      hasTierStep: true, tierResolved: true,
      includesEvents: includesEventRegistration, includesSports: includesSportsRegistration, steps,
    });
  });

  it('does not allow activities until a tier is selected', () => {
    expect(resolveRegistrationDecisions(majorEvent, null)).toMatchObject({ tierResolved: false, includesEvents: false, steps: ['tier'] });
  });

  it('preserves event access for legacy tiers', () => {
    expect(resolveRegistrationDecisions(majorEvent, baseTier).includesEvents).toBe(true);
  });

  it('keeps free registrations without tier decisions', () => {
    expect(resolveRegistrationDecisions({ ...majorEvent, isPaymentRequired: false }, null)).toMatchObject({
      hasTierStep: false, tierResolved: true, includesEvents: true, steps: ['events'],
    });
  });
});
