import { generateSingleEliminationBracket, planSportsWinnerAdvancement, SportsBracketEntrant } from './sports-brackets';

describe('single-elimination bracket generation', () => {
  const entrants = (count: number): SportsBracketEntrant[] =>
    Array.from({ length: count }, (_, index) => ({
      registrationId: `registration-${index + 1}`,
      seed: index + 1,
    }));

  it('places manual seeds so the strongest seeds can only meet late', () => {
    const bracket = generateSingleEliminationBracket({
      entrants: entrants(8),
      seedingMode: 'MANUAL',
    });

    expect(bracket.bracketSize).toBe(8);
    expect(bracket.rounds).toHaveLength(3);
    expect(bracket.rounds[0].matches.map((match) => [match.home, match.away])).toEqual([
      [
        { type: 'REGISTRATION', registrationId: 'registration-1', seed: 1 },
        { type: 'REGISTRATION', registrationId: 'registration-8', seed: 8 },
      ],
      [
        { type: 'REGISTRATION', registrationId: 'registration-4', seed: 4 },
        { type: 'REGISTRATION', registrationId: 'registration-5', seed: 5 },
      ],
      [
        { type: 'REGISTRATION', registrationId: 'registration-2', seed: 2 },
        { type: 'REGISTRATION', registrationId: 'registration-7', seed: 7 },
      ],
      [
        { type: 'REGISTRATION', registrationId: 'registration-3', seed: 3 },
        { type: 'REGISTRATION', registrationId: 'registration-6', seed: 6 },
      ],
    ]);
  });

  it('creates byes and explicit automatic advancement plans', () => {
    const bracket = generateSingleEliminationBracket({
      entrants: entrants(6),
      seedingMode: 'MANUAL',
    });

    expect(bracket.bracketSize).toBe(8);
    expect(bracket.automaticAdvancements).toEqual([
      {
        sourceMatchKey: 'R1-M1',
        targetMatchKey: 'R2-M1',
        targetSide: 'HOME',
        registrationId: 'registration-1',
      },
      {
        sourceMatchKey: 'R1-M3',
        targetMatchKey: 'R2-M2',
        targetSide: 'HOME',
        registrationId: 'registration-2',
      },
    ]);
  });

  it('supports partial manual seeds and deterministically injected random ordering', () => {
    const partiallySeeded: SportsBracketEntrant[] = [
      { registrationId: 'unseeded-a' },
      { registrationId: 'seed-2', seed: 2 },
      { registrationId: 'unseeded-b' },
      { registrationId: 'seed-4', seed: 4 },
    ];
    const manual = generateSingleEliminationBracket({
      entrants: partiallySeeded,
      seedingMode: 'MANUAL',
    });
    expect(manual.rounds[0].matches[0].home).toEqual({
      type: 'REGISTRATION',
      registrationId: 'unseeded-a',
      seed: 1,
    });

    const randomValues = [0, 0, 0];
    const randomized = generateSingleEliminationBracket({
      entrants: entrants(4),
      seedingMode: 'RANDOM',
      random: () => randomValues.shift() ?? 0,
    });
    expect(randomized.rounds[0].matches[0].home).toMatchObject({
      registrationId: 'registration-2',
      seed: 1,
    });
    expect(randomized.rounds[0].matches[0].away).toMatchObject({
      registrationId: 'registration-1',
      seed: 4,
    });
  });

  it('rejects duplicate registrations, duplicate seeds, and invalid random sources', () => {
    expect(() =>
      generateSingleEliminationBracket({
        entrants: [{ registrationId: 'same' }, { registrationId: 'same' }],
        seedingMode: 'MANUAL',
      }),
    ).toThrow('appears more than once');
    expect(() =>
      generateSingleEliminationBracket({
        entrants: [
          { registrationId: 'a', seed: 1 },
          { registrationId: 'b', seed: 1 },
        ],
        seedingMode: 'MANUAL',
      }),
    ).toThrow('Seed 1 is assigned more than once');
    expect(() =>
      generateSingleEliminationBracket({
        entrants: entrants(2),
        seedingMode: 'RANDOM',
        random: () => 1,
      }),
    ).toThrow('random source');
  });
});

describe('winner advancement planning', () => {
  function input(
    overrides: Partial<Parameters<typeof planSportsWinnerAdvancement>[0]['source']> = {},
    targetOverrides: Partial<NonNullable<Parameters<typeof planSportsWinnerAdvancement>[0]['target']>> = {},
  ): Parameters<typeof planSportsWinnerAdvancement>[0] {
    return {
      source: {
        id: 'semi-1',
        outcome: 'FINALIZED',
        state: 'FINISHED',
        homeRegistrationId: 'team-a',
        awayRegistrationId: 'team-b',
        winnerRegistrationId: 'team-a',
        winnerAdvancesToId: 'final',
        winnerAdvancesToSide: 'HOME',
        ...overrides,
      },
      target: {
        id: 'final',
        state: 'SCHEDULED',
        homeRegistrationId: null,
        awayRegistrationId: null,
        ...targetOverrides,
      },
    };
  }

  it('plans a compare-and-set assignment into an empty scheduled slot', () => {
    expect(planSportsWinnerAdvancement(input())).toEqual({
      status: 'ASSIGN',
      targetMatchId: 'final',
      side: 'HOME',
      registrationId: 'team-a',
      expectedCurrentRegistrationId: null,
    });
  });

  it('is idempotent when the same winner was already advanced', () => {
    expect(planSportsWinnerAdvancement(input({}, { homeRegistrationId: 'team-a' }))).toMatchObject({
      status: 'NOOP',
      reason: 'ALREADY_ASSIGNED',
    });
  });

  it('reports drift instead of overwriting another registration', () => {
    expect(planSportsWinnerAdvancement(input({}, { homeRegistrationId: 'different-team' }))).toEqual({
      status: 'CONFLICT',
      reason: 'TARGET_SLOT_OCCUPIED',
      targetMatchId: 'final',
      side: 'HOME',
      registrationId: 'team-a',
      occupyingRegistrationId: 'different-team',
    });
  });

  it('blocks invalid winners and changes to matches that already started while allowing structural byes', () => {
    expect(planSportsWinnerAdvancement(input({ winnerRegistrationId: 'not-a-participant' }))).toEqual({
      status: 'BLOCKED',
      reason: 'WINNER_NOT_IN_SOURCE_MATCH',
    });

    expect(planSportsWinnerAdvancement(input({}, { state: 'CHECK_IN' }))).toEqual({
      status: 'BLOCKED',
      reason: 'TARGET_ALREADY_STARTED',
    });
    expect(planSportsWinnerAdvancement(input({ outcome: 'AUTOMATIC_BYE', state: 'SCHEDULED' }))).toEqual({
      status: 'ASSIGN',
      targetMatchId: 'final',
      side: 'HOME',
      registrationId: 'team-a',
      expectedCurrentRegistrationId: null,
    });
  });
});
