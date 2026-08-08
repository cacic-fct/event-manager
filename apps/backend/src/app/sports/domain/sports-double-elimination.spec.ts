import {
  generateSportsDoubleEliminationBracket,
  planSportsGrandFinalOutcome,
  SportsDoubleEliminationMatchPlan,
} from './sports-double-elimination';

describe('double-elimination bracket generation', () => {
  const entrants = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      registrationId: `registration-${index + 1}`,
      seed: index + 1,
    }));

  it('builds power-of-two winners and losers brackets with explicit outcome routes', () => {
    const bracket = generateSportsDoubleEliminationBracket({
      entrants: entrants(8),
      seedingMode: 'MANUAL',
    });

    expect(bracket.winnersRounds.map((round) => round.length)).toEqual([4, 2, 1]);
    expect(bracket.losersRounds.map((round) => round.length)).toEqual([2, 2, 1, 1]);
    expect(bracket.grandFinal).toMatchObject({
      key: 'GF-R1-M1',
      home: { type: 'WINNER', sourceMatchKey: 'WB-R3-M1' },
      away: { type: 'WINNER', sourceMatchKey: 'LB-R4-M1' },
    });
    expect(bracket.winnersRounds[0][0].advancements).toEqual([
      { outcome: 'WINNER', targetMatchKey: 'WB-R2-M1', targetSide: 'HOME' },
      { outcome: 'LOSER', targetMatchKey: 'LB-R1-M1', targetSide: 'HOME' },
    ]);
    expect(bracket.winnersRounds[1][0].advancements).toEqual([
      { outcome: 'WINNER', targetMatchKey: 'WB-R3-M1', targetSide: 'HOME' },
      { outcome: 'LOSER', targetMatchKey: 'LB-R2-M2', targetSide: 'AWAY' },
    ]);
    expect(bracket.losersRounds[2][0].advancements).toEqual([
      { outcome: 'WINNER', targetMatchKey: 'LB-R4-M1', targetSide: 'HOME' },
    ]);
  });

  it('ensures every advancement points to an existing match and expected source slot', () => {
    const bracket = generateSportsDoubleEliminationBracket({
      entrants: entrants(16),
      seedingMode: 'MANUAL',
    });
    const matches = [
      ...bracket.winnersRounds.flat(),
      ...bracket.losersRounds.flat(),
      bracket.grandFinal,
    ];
    const byKey = new Map(matches.map((match) => [match.key, match]));

    for (const source of matches) {
      for (const route of source.advancements) {
        const target = byKey.get(route.targetMatchKey);
        expect(target).toBeDefined();
        const slot = route.targetSide === 'HOME' ? target?.home : target?.away;
        expect(slot).toEqual({
          type: route.outcome,
          sourceMatchKey: source.key,
        });
      }
    }
  });

  it('represents winners-bracket byes and absent losers without inventing registrations', () => {
    const bracket = generateSportsDoubleEliminationBracket({
      entrants: entrants(6),
      seedingMode: 'MANUAL',
    });

    expect(bracket.automaticAdvancements).toEqual([
      {
        sourceMatchKey: 'WB-R1-M1',
        targetMatchKey: 'WB-R2-M1',
        targetSide: 'HOME',
        registrationId: 'registration-1',
      },
      {
        sourceMatchKey: 'WB-R1-M3',
        targetMatchKey: 'WB-R2-M2',
        targetSide: 'HOME',
        registrationId: 'registration-2',
      },
    ]);
    expect(bracket.losersRounds[0][0]).toMatchObject({
      home: { type: 'BYE' },
      hasStructuralBye: true,
      automaticWinnerRegistrationId: null,
    });
    expect(
      bracket.winnersRounds[0][0].advancements.some(
        (route) => route.outcome === 'LOSER',
      ),
    ).toBe(false);
  });

  it('supports a two-registration double-elimination final without a fake losers round', () => {
    const bracket = generateSportsDoubleEliminationBracket({
      entrants: entrants(2),
      seedingMode: 'MANUAL',
    });

    expect(bracket.losersRounds).toEqual([]);
    expect(bracket.winnersRounds[0][0].advancements).toEqual([
      { outcome: 'WINNER', targetMatchKey: 'GF-R1-M1', targetSide: 'HOME' },
      { outcome: 'LOSER', targetMatchKey: 'GF-R1-M1', targetSide: 'AWAY' },
    ]);
    expect(bracket.grandFinalReset).toEqual({
      requiredWhenGrandFinalWinnerEnteredFrom: 'LOSERS',
      homeSource: { type: 'WINNER', sourceMatchKey: 'GF-R1-M1' },
      awaySource: { type: 'LOSER', sourceMatchKey: 'GF-R1-M1' },
    });
  });

  it('does not route a bye as a real loser', () => {
    const bracket = generateSportsDoubleEliminationBracket({
      entrants: entrants(5),
      seedingMode: 'MANUAL',
    });
    const firstLosersRound = bracket.losersRounds[0];
    const loserSources = firstLosersRound.flatMap((match: SportsDoubleEliminationMatchPlan) => [
      match.home,
      match.away,
    ]);

    expect(loserSources.filter((slot) => slot.type === 'BYE')).toHaveLength(3);
  });

  it('propagates fully empty losers-bracket matches as byes', () => {
    const bracket = generateSportsDoubleEliminationBracket({
      entrants: entrants(5),
      seedingMode: 'MANUAL',
    });
    const empty = bracket.losersRounds[0].find(
      (match) => match.home.type === 'BYE' && match.away.type === 'BYE',
    );

    expect(empty).toMatchObject({
      isStructurallyEmpty: true,
      advancements: [],
    });
    expect(
      bracket.losersRounds[1].some(
        (match) => match.home.type === 'BYE' || match.away.type === 'BYE',
      ),
    ).toBe(true);
  });
});

describe('double-elimination grand-final lifecycle', () => {
  it('decides the championship when the winners-bracket entrant wins', () => {
    expect(
      planSportsGrandFinalOutcome({
        homeRegistrationId: 'winners-bracket',
        awayRegistrationId: 'losers-bracket',
        winnerRegistrationId: 'winners-bracket',
      }),
    ).toEqual({
      status: 'CHAMPIONSHIP_DECIDED',
      winnerRegistrationId: 'winners-bracket',
      loserRegistrationId: 'losers-bracket',
    });
  });

  it('requires a reset when the losers-bracket entrant wins', () => {
    expect(
      planSportsGrandFinalOutcome({
        homeRegistrationId: 'winners-bracket',
        awayRegistrationId: 'losers-bracket',
        winnerRegistrationId: 'losers-bracket',
      }),
    ).toEqual({
      status: 'RESET_REQUIRED',
      resetHomeRegistrationId: 'losers-bracket',
      resetAwayRegistrationId: 'winners-bracket',
    });
  });

  it('blocks malformed or incomplete grand-final outcomes', () => {
    expect(
      planSportsGrandFinalOutcome({
        homeRegistrationId: 'home',
        awayRegistrationId: null,
        winnerRegistrationId: 'home',
      }),
    ).toEqual({ status: 'BLOCKED', reason: 'PARTICIPANTS_MISSING' });
    expect(
      planSportsGrandFinalOutcome({
        homeRegistrationId: 'home',
        awayRegistrationId: 'away',
        winnerRegistrationId: 'other',
      }),
    ).toEqual({ status: 'BLOCKED', reason: 'WINNER_NOT_IN_GRAND_FINAL' });
  });
});
