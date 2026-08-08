import { SportsMatchState } from './sports-match-state';

export type SportsBracketSide = 'HOME' | 'AWAY';
export type SportsBracketSeedingMode = 'MANUAL' | 'RANDOM';

export interface SportsBracketEntrant {
  readonly registrationId: string;
  readonly seed?: number | null;
}

export type SportsBracketSlot =
  | {
      readonly type: 'REGISTRATION';
      readonly registrationId: string;
      readonly seed: number;
    }
  | {
      readonly type: 'WINNER';
      readonly sourceMatchKey: string;
    }
  | {
      readonly type: 'BYE';
    };

export interface SportsBracketMatchPlan {
  readonly key: string;
  readonly roundNumber: number;
  readonly position: number;
  readonly home: SportsBracketSlot;
  readonly away: SportsBracketSlot;
  readonly winnerAdvancesToKey: string | null;
  readonly winnerAdvancesToSide: SportsBracketSide | null;
  readonly automaticWinnerRegistrationId: string | null;
}

export interface SportsBracketRoundPlan {
  readonly roundNumber: number;
  readonly matches: readonly SportsBracketMatchPlan[];
}

export interface SportsAutomaticAdvancementPlan {
  readonly sourceMatchKey: string;
  readonly targetMatchKey: string;
  readonly targetSide: SportsBracketSide;
  readonly registrationId: string;
}

export interface SingleEliminationBracketPlan {
  readonly entrantCount: number;
  readonly bracketSize: number;
  readonly rounds: readonly SportsBracketRoundPlan[];
  readonly automaticAdvancements: readonly SportsAutomaticAdvancementPlan[];
}

export interface GenerateSingleEliminationBracketInput {
  readonly entrants: readonly SportsBracketEntrant[];
  readonly seedingMode: SportsBracketSeedingMode;
  readonly random?: () => number;
}

const BYE_SLOT: SportsBracketSlot = { type: 'BYE' };

export function generateSingleEliminationBracket(
  input: GenerateSingleEliminationBracketInput,
): SingleEliminationBracketPlan {
  validateEntrants(input.entrants);
  if (input.entrants.length < 2) {
    throw new Error('A single-elimination bracket requires at least two registrations.');
  }

  const orderedEntrants =
    input.seedingMode === 'RANDOM'
      ? shuffleEntrants(input.entrants, input.random ?? Math.random)
      : orderManualSeeds(input.entrants);
  const bracketSize = nextPowerOfTwo(orderedEntrants.length);
  const seeds = seedPositions(bracketSize);
  const entrantBySeed = new Map(
    orderedEntrants.map((entrant, index) => [
      index + 1,
      {
        type: 'REGISTRATION',
        registrationId: entrant.registrationId,
        seed: index + 1,
      } as const,
    ]),
  );
  const numberOfRounds = Math.log2(bracketSize);
  const rounds: SportsBracketRoundPlan[] = [];

  const firstRoundMatches: SportsBracketMatchPlan[] = [];
  for (let index = 0; index < seeds.length; index += 2) {
    const position = index / 2 + 1;
    const home = entrantBySeed.get(seeds[index]) ?? BYE_SLOT;
    const away = entrantBySeed.get(seeds[index + 1]) ?? BYE_SLOT;
    firstRoundMatches.push(
      createBracketMatchPlan(1, position, home, away, numberOfRounds),
    );
  }
  rounds.push({ roundNumber: 1, matches: firstRoundMatches });

  for (let roundNumber = 2; roundNumber <= numberOfRounds; roundNumber += 1) {
    const previousRound = rounds[roundNumber - 2];
    const matchCount = bracketSize / 2 ** roundNumber;
    const matches: SportsBracketMatchPlan[] = [];
    for (let position = 1; position <= matchCount; position += 1) {
      matches.push(
        createBracketMatchPlan(
          roundNumber,
          position,
          {
            type: 'WINNER',
            sourceMatchKey: previousRound.matches[(position - 1) * 2].key,
          },
          {
            type: 'WINNER',
            sourceMatchKey: previousRound.matches[(position - 1) * 2 + 1].key,
          },
          numberOfRounds,
        ),
      );
    }
    rounds.push({ roundNumber, matches });
  }

  const automaticAdvancements = firstRoundMatches.flatMap((match) => {
    if (
      !match.automaticWinnerRegistrationId ||
      !match.winnerAdvancesToKey ||
      !match.winnerAdvancesToSide
    ) {
      return [];
    }
    return [
      {
        sourceMatchKey: match.key,
        targetMatchKey: match.winnerAdvancesToKey,
        targetSide: match.winnerAdvancesToSide,
        registrationId: match.automaticWinnerRegistrationId,
      },
    ];
  });

  return {
    entrantCount: orderedEntrants.length,
    bracketSize,
    rounds,
    automaticAdvancements,
  };
}

export type WinnerAdvancementBlockReason =
  | 'SOURCE_NOT_FINAL'
  | 'WINNER_MISSING'
  | 'WINNER_NOT_IN_SOURCE_MATCH'
  | 'TARGET_REFERENCE_MISSING'
  | 'TARGET_REFERENCE_MISMATCH'
  | 'TARGET_ALREADY_STARTED';

export type WinnerAdvancementPlan =
  | {
      readonly status: 'ASSIGN';
      readonly targetMatchId: string;
      readonly side: SportsBracketSide;
      readonly registrationId: string;
      readonly expectedCurrentRegistrationId: null;
    }
  | {
      readonly status: 'NOOP';
      readonly reason: 'ALREADY_ASSIGNED';
      readonly targetMatchId: string;
      readonly side: SportsBracketSide;
      readonly registrationId: string;
    }
  | {
      readonly status: 'CONFLICT';
      readonly reason: 'TARGET_SLOT_OCCUPIED';
      readonly targetMatchId: string;
      readonly side: SportsBracketSide;
      readonly registrationId: string;
      readonly occupyingRegistrationId: string;
    }
  | {
      readonly status: 'BLOCKED';
      readonly reason: WinnerAdvancementBlockReason;
    };

export interface PlanWinnerAdvancementInput {
  readonly source: {
    readonly id: string;
    readonly outcome: 'FINALIZED' | 'AUTOMATIC_BYE';
    readonly state: SportsMatchState;
    readonly homeRegistrationId: string | null;
    readonly awayRegistrationId: string | null;
    readonly winnerRegistrationId: string | null;
    readonly winnerAdvancesToId: string | null;
    readonly winnerAdvancesToSide: SportsBracketSide | null;
  };
  readonly target: {
    readonly id: string;
    readonly state: SportsMatchState;
    readonly homeRegistrationId: string | null;
    readonly awayRegistrationId: string | null;
  } | null;
}

export function planSportsWinnerAdvancement(
  input: PlanWinnerAdvancementInput,
): WinnerAdvancementPlan {
  const source = input.source;
  if (source.outcome === 'FINALIZED' && source.state !== 'FINISHED') {
    return { status: 'BLOCKED', reason: 'SOURCE_NOT_FINAL' };
  }
  if (!source.winnerRegistrationId) {
    return { status: 'BLOCKED', reason: 'WINNER_MISSING' };
  }
  if (
    source.winnerRegistrationId !== source.homeRegistrationId &&
    source.winnerRegistrationId !== source.awayRegistrationId
  ) {
    return { status: 'BLOCKED', reason: 'WINNER_NOT_IN_SOURCE_MATCH' };
  }
  if (!source.winnerAdvancesToId || !source.winnerAdvancesToSide || !input.target) {
    return { status: 'BLOCKED', reason: 'TARGET_REFERENCE_MISSING' };
  }
  if (input.target.id !== source.winnerAdvancesToId) {
    return { status: 'BLOCKED', reason: 'TARGET_REFERENCE_MISMATCH' };
  }

  const existingRegistrationId =
    source.winnerAdvancesToSide === 'HOME'
      ? input.target.homeRegistrationId
      : input.target.awayRegistrationId;
  if (existingRegistrationId === source.winnerRegistrationId) {
    return {
      status: 'NOOP',
      reason: 'ALREADY_ASSIGNED',
      targetMatchId: input.target.id,
      side: source.winnerAdvancesToSide,
      registrationId: source.winnerRegistrationId,
    };
  }
  if (existingRegistrationId) {
    return {
      status: 'CONFLICT',
      reason: 'TARGET_SLOT_OCCUPIED',
      targetMatchId: input.target.id,
      side: source.winnerAdvancesToSide,
      registrationId: source.winnerRegistrationId,
      occupyingRegistrationId: existingRegistrationId,
    };
  }
  if (input.target.state !== 'SCHEDULED') {
    return { status: 'BLOCKED', reason: 'TARGET_ALREADY_STARTED' };
  }

  return {
    status: 'ASSIGN',
    targetMatchId: input.target.id,
    side: source.winnerAdvancesToSide,
    registrationId: source.winnerRegistrationId,
    expectedCurrentRegistrationId: null,
  };
}

function createBracketMatchPlan(
  roundNumber: number,
  position: number,
  home: SportsBracketSlot,
  away: SportsBracketSlot,
  numberOfRounds: number,
): SportsBracketMatchPlan {
  const key = matchKey(roundNumber, position);
  const hasHomeRegistration = home.type === 'REGISTRATION';
  const hasAwayRegistration = away.type === 'REGISTRATION';
  const automaticWinnerRegistrationId =
    hasHomeRegistration && away.type === 'BYE'
      ? home.registrationId
      : hasAwayRegistration && home.type === 'BYE'
        ? away.registrationId
        : null;

  return {
    key,
    roundNumber,
    position,
    home,
    away,
    winnerAdvancesToKey:
      roundNumber < numberOfRounds ? matchKey(roundNumber + 1, Math.ceil(position / 2)) : null,
    winnerAdvancesToSide:
      roundNumber < numberOfRounds ? (position % 2 === 1 ? 'HOME' : 'AWAY') : null,
    automaticWinnerRegistrationId,
  };
}

function orderManualSeeds(entrants: readonly SportsBracketEntrant[]): SportsBracketEntrant[] {
  const positioned: Array<SportsBracketEntrant | undefined> = Array.from({
    length: entrants.length,
  });
  const unseeded: SportsBracketEntrant[] = [];

  for (const entrant of entrants) {
    if (entrant.seed === null || entrant.seed === undefined) {
      unseeded.push(entrant);
      continue;
    }
    if (!Number.isInteger(entrant.seed) || entrant.seed < 1 || entrant.seed > entrants.length) {
      throw new Error(`Seed for registration ${entrant.registrationId} is outside the bracket.`);
    }
    if (positioned[entrant.seed - 1]) {
      throw new Error(`Seed ${entrant.seed} is assigned more than once.`);
    }
    positioned[entrant.seed - 1] = entrant;
  }

  let unseededIndex = 0;
  return positioned.map((entrant) => entrant ?? unseeded[unseededIndex++]);
}

function shuffleEntrants(
  entrants: readonly SportsBracketEntrant[],
  random: () => number,
): SportsBracketEntrant[] {
  const shuffled = entrants.map((entrant) => ({ ...entrant, seed: null }));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomValue = random();
    if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
      throw new Error('Bracket random source must return a number from 0 (inclusive) to 1 (exclusive).');
    }
    const swapIndex = Math.floor(randomValue * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function validateEntrants(entrants: readonly SportsBracketEntrant[]): void {
  const ids = new Set<string>();
  for (const entrant of entrants) {
    if (!entrant.registrationId.trim()) {
      throw new Error('Bracket registration ids cannot be empty.');
    }
    if (ids.has(entrant.registrationId)) {
      throw new Error(`Registration ${entrant.registrationId} appears more than once in the bracket.`);
    }
    ids.add(entrant.registrationId);
  }
}

function seedPositions(size: number): number[] {
  let positions = [1, 2];
  while (positions.length < size) {
    const nextSize = positions.length * 2;
    positions = positions.flatMap((seed) => [seed, nextSize + 1 - seed]);
  }
  return positions;
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(value));
}

function matchKey(roundNumber: number, position: number): string {
  return `R${roundNumber}-M${position}`;
}
