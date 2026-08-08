import {
  canTransitionSportsMatchState,
  isTerminalSportsMatchState,
  planSportsMatchStateTransition,
  resolvePublicSportsMatchState,
} from './sports-match-state';

describe('sports match state rules', () => {
  it('supports the normal official-operated match lifecycle', () => {
    expect(canTransitionSportsMatchState({ from: 'SCHEDULED', to: 'CHECK_IN', actor: 'OFFICIAL' })).toBe(true);
    expect(canTransitionSportsMatchState({ from: 'CHECK_IN', to: 'LIVE', actor: 'OFFICIAL' })).toBe(true);
    expect(canTransitionSportsMatchState({ from: 'LIVE', to: 'PAUSED', actor: 'OFFICIAL' })).toBe(true);
    expect(canTransitionSportsMatchState({ from: 'PAUSED', to: 'LIVE', actor: 'OFFICIAL' })).toBe(true);
  });

  it('queues official outcomes for review and freezes further non-admin edits', () => {
    expect(planSportsMatchStateTransition({ from: 'LIVE', to: 'FINISHED', actor: 'OFFICIAL' })).toEqual({
      from: 'LIVE',
      to: 'FINISHED',
      requiresAdminReview: true,
      freezesNonAdminEdits: true,
    });
    expect(canTransitionSportsMatchState({ from: 'FINISHED', to: 'SCHEDULED', actor: 'OFFICIAL' })).toBe(false);
  });

  it('allows trusted admins to reschedule terminal matches', () => {
    expect(planSportsMatchStateTransition({ from: 'CANCELED', to: 'SCHEDULED', actor: 'ADMIN' })).toMatchObject({
      requiresAdminReview: false,
      freezesNonAdminEdits: false,
    });
    expect(isTerminalSportsMatchState('DRAW')).toBe(true);
  });

  it('prioritizes pending live intent publicly, but hides rejected outcomes', () => {
    expect(
      resolvePublicSportsMatchState({
        canonicalState: 'LIVE',
        intendedState: 'CANCELED',
        reviewStatus: 'PENDING',
      }),
    ).toBe('LIVE');
    expect(
      resolvePublicSportsMatchState({
        canonicalState: 'LIVE',
        intendedState: 'CANCELED',
        reviewStatus: 'REJECTED',
      }),
    ).toBe('LIVE');
  });
});
