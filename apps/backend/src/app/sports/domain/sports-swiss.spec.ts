import {
  generateSportsSwissRound,
  rankSportsSwissStandings,
  SportsSwissStanding,
} from './sports-swiss';

describe('Swiss pairing', () => {
  it('uses points, tiebreakers, seed, and registration id as deterministic ranking keys', () => {
    expect(
      rankSportsSwissStandings([
        { registrationId: 'z', points: 3, tiebreakers: [4], seed: 1 },
        { registrationId: 'b', points: 4, tiebreakers: [2], seed: 2 },
        { registrationId: 'a', points: 4, tiebreakers: [2], seed: 2 },
        { registrationId: 'c', points: 4, tiebreakers: [1], seed: 1 },
      ]).map((standing) => standing.registrationId),
    ).toEqual(['a', 'b', 'c', 'z']);
  });

  it('finds a rematch-free round when one exists and keeps close scores together', () => {
    const standings: SportsSwissStanding[] = [
      { registrationId: 'a', points: 3 },
      { registrationId: 'b', points: 3 },
      { registrationId: 'c', points: 2 },
      { registrationId: 'd', points: 2 },
      { registrationId: 'e', points: 1 },
      { registrationId: 'f', points: 1 },
    ];
    const plan = generateSportsSwissRound({
      roundNumber: 3,
      standings,
      matchHistory: [
        { homeRegistrationId: 'a', awayRegistrationId: 'b' },
        { homeRegistrationId: 'c', awayRegistrationId: 'd' },
        { homeRegistrationId: 'e', awayRegistrationId: 'f' },
      ],
    });

    expect(plan.containsUnavoidableRematch).toBe(false);
    expect(plan.pairings.every((pairing) => pairing.rematch === false)).toBe(true);
    expect(
      new Set(
        plan.pairings.flatMap((pairing) => [
          pairing.homeRegistrationId,
          pairing.awayRegistrationId,
        ]),
      ).size,
    ).toBe(6);
  });

  it('awards an odd-player bye to the lowest-ranked registration without a prior bye', () => {
    const plan = generateSportsSwissRound({
      roundNumber: 4,
      standings: [
        { registrationId: 'a', points: 4, byeCount: 0 },
        { registrationId: 'b', points: 3, byeCount: 0 },
        { registrationId: 'c', points: 2, byeCount: 0 },
        { registrationId: 'd', points: 1, byeCount: 0 },
        { registrationId: 'e', points: 0, byeCount: 1 },
      ],
      matchHistory: [],
    });

    expect(plan.byeRegistrationId).toBe('d');
    expect(
      plan.pairings.some(
        (pairing) =>
          pairing.homeRegistrationId === 'd' || pairing.awayRegistrationId === 'd',
      ),
    ).toBe(false);
  });

  it('marks a rematch only when no rematch-free pairing is possible', () => {
    const plan = generateSportsSwissRound({
      roundNumber: 2,
      standings: [
        { registrationId: 'a', points: 1 },
        { registrationId: 'b', points: 0 },
      ],
      matchHistory: [{ homeRegistrationId: 'a', awayRegistrationId: 'b' }],
    });

    expect(plan).toMatchObject({
      containsUnavoidableRematch: true,
      pairings: [{ homeRegistrationId: 'a', awayRegistrationId: 'b', rematch: true }],
    });
  });

  it('rejects drifted history and invalid standings', () => {
    expect(() =>
      generateSportsSwissRound({
        roundNumber: 1,
        standings: [
          { registrationId: 'a', points: 0 },
          { registrationId: 'b', points: 0 },
        ],
        matchHistory: [{ homeRegistrationId: 'a', awayRegistrationId: 'unknown' }],
      }),
    ).toThrow('unknown registration');
    expect(() =>
      generateSportsSwissRound({
        roundNumber: 1,
        standings: [
          { registrationId: 'a', points: Number.NaN },
          { registrationId: 'b', points: 0 },
        ],
        matchHistory: [],
      }),
    ).toThrow('finite numbers');
  });
});
