import { describe, expect, it } from 'vitest';
import { getTierAutomaticSelectionIds, getTierSelectableEventIds } from './price-tier-registration';

const events = [
  { id: 'first', eventGroupId: 'group', autoSubscribe: true },
  { id: 'second', eventGroupId: 'group', autoSubscribe: false },
  { id: 'direct', eventGroupId: null, autoSubscribe: true },
];
const restricted = { restrictEventSelection: true, allowedEventIds: ['first', 'second'] };

describe('shared price tier activity selection', () => {
  it('preserves event and automatic selection when rules are disabled', () => {
    expect([...getTierSelectableEventIds(events, null)]).toEqual(['first', 'second', 'direct']);
    expect([...getTierAutomaticSelectionIds(events, null)]).toEqual(['first', 'direct']);
  });

  it('selects and automatically enrolls entire whitelisted groups', () => {
    expect([...getTierSelectableEventIds(events, restricted)]).toEqual(['first', 'second']);
    expect([...getTierAutomaticSelectionIds(events, restricted)]).toEqual(['first', 'second']);
  });

  it('blocks partial whitelists including their automatic events', () => {
    const tier = { restrictEventSelection: true, allowedEventIds: ['first', 'direct'] };
    expect([...getTierSelectableEventIds(events, tier)]).toEqual(['direct']);
    expect([...getTierAutomaticSelectionIds(events, tier)]).toEqual(['direct']);
  });

  it('blocks groups with active members absent from the participant candidates', () => {
    const candidates = [events[0], events[2]];
    expect([...getTierSelectableEventIds(candidates, restricted, events)]).toEqual([]);
    expect([...getTierAutomaticSelectionIds(candidates, restricted, events)]).toEqual([]);
  });

  it('denies all activities for empty enabled lists and tiers excluding registration', () => {
    expect([...getTierSelectableEventIds(events, { restrictEventSelection: true })]).toEqual([]);
    expect([...getTierSelectableEventIds(events, { includesEventRegistration: false })]).toEqual([]);
    expect([...getTierAutomaticSelectionIds(events, { includesEventRegistration: false })]).toEqual([]);
  });
});
