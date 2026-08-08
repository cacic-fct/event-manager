import {
  allocateSportsGroups,
  planSportsGroupElimination,
  planSportsGroupStage,
} from './sports-groups';

describe('sports group-stage planning', () => {
  const entrants = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      registrationId: `registration-${index + 1}`,
      seed: index + 1,
    }));

  it('uses serpentine seeded allocation to balance groups', () => {
    const groups = allocateSportsGroups({
      entrants: entrants(8),
      groupCount: 2,
    });

    expect(groups.map((group) => group.key)).toEqual(['A', 'B']);
    expect(groups[0].entrants.map((entrant) => entrant.seed)).toEqual([1, 4, 5, 8]);
    expect(groups[1].entrants.map((entrant) => entrant.seed)).toEqual([2, 3, 6, 7]);
  });

  it('creates a complete round robin independently inside every group', () => {
    const stage = planSportsGroupStage({
      entrants: entrants(8),
      groupCount: 2,
    });

    expect(stage.groups).toHaveLength(2);
    for (const group of stage.groups) {
      expect(group.rounds).toHaveLength(3);
      expect(group.rounds.flatMap((round) => round.matches)).toHaveLength(6);
      const scheduledIds = new Set(
        group.rounds.flatMap((round) =>
          round.matches.flatMap((match) => [
            match.homeRegistrationId,
            match.awayRegistrationId,
          ]),
        ),
      );
      expect(scheduledIds).toEqual(
        new Set(group.entrants.map((entrant) => entrant.registrationId)),
      );
    }
  });

  it('plans cross-group elimination qualifiers without first-round same-group matches', () => {
    const elimination = planSportsGroupElimination({
      groups: [{ key: 'A' }, { key: 'B' }, { key: 'C' }, { key: 'D' }],
      qualifiersPerGroup: 2,
    });

    expect(elimination.bracketSize).toBe(8);
    expect(elimination.qualifiers).toHaveLength(8);
    for (const match of elimination.rounds[0]) {
      if (match.home.type === 'GROUP_POSITION' && match.away.type === 'GROUP_POSITION') {
        expect(match.home.groupKey).not.toBe(match.away.groupKey);
      }
    }
  });

  it('retains structural byes while repairing avoidable same-group pairings', () => {
    const elimination = planSportsGroupElimination({
      groups: [{ key: 'A' }, { key: 'B' }, { key: 'C' }],
      qualifiersPerGroup: 2,
    });

    expect(elimination.bracketSize).toBe(8);
    expect(elimination.rounds[0].filter((match) => match.hasStructuralBye)).toHaveLength(2);
    for (const match of elimination.rounds[0]) {
      if (match.home.type === 'GROUP_POSITION' && match.away.type === 'GROUP_POSITION') {
        expect(match.home.groupKey).not.toBe(match.away.groupKey);
      }
    }
  });

  it('supports partial manual seeds and rejects invalid group shapes', () => {
    const groups = allocateSportsGroups({
      entrants: [
        { registrationId: 'unseeded-a' },
        { registrationId: 'seed-2', seed: 2 },
        { registrationId: 'unseeded-b' },
        { registrationId: 'seed-4', seed: 4 },
      ],
      groupCount: 2,
    });
    expect(groups[0].entrants[0]).toEqual({
      registrationId: 'unseeded-a',
      seed: 1,
    });

    expect(() =>
      allocateSportsGroups({ entrants: entrants(3), groupCount: 2 }),
    ).toThrow('at least two registrations');
    expect(() =>
      planSportsGroupElimination({
        groups: [{ key: 'A' }, { key: 'A' }],
        qualifiersPerGroup: 1,
      }),
    ).toThrow('appears more than once');
  });
});
