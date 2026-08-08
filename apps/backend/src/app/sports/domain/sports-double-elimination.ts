import {
  generateSingleEliminationBracket,
  SportsAutomaticAdvancementPlan,
  SportsBracketEntrant,
  SportsBracketSeedingMode,
  SportsBracketSide,
  SportsBracketSlot,
} from './sports-brackets';

export type SportsDoubleEliminationStage = 'WINNERS' | 'LOSERS' | 'GRAND_FINAL';
export type SportsBracketOutcome = 'WINNER' | 'LOSER';

export type SportsDoubleEliminationSlot =
  | SportsBracketSlot
  | {
      readonly type: 'LOSER';
      readonly sourceMatchKey: string;
    };

export interface SportsDoubleEliminationAdvancement {
  readonly outcome: SportsBracketOutcome;
  readonly targetMatchKey: string;
  readonly targetSide: SportsBracketSide;
}

export interface SportsDoubleEliminationMatchPlan {
  readonly key: string;
  readonly stage: SportsDoubleEliminationStage;
  readonly roundNumber: number;
  readonly position: number;
  readonly home: SportsDoubleEliminationSlot;
  readonly away: SportsDoubleEliminationSlot;
  readonly advancements: readonly SportsDoubleEliminationAdvancement[];
  readonly hasStructuralBye: boolean;
  readonly isStructurallyEmpty: boolean;
  readonly automaticWinnerRegistrationId: string | null;
}

export interface SportsGrandFinalResetRule {
  readonly requiredWhenGrandFinalWinnerEnteredFrom: 'LOSERS';
  readonly homeSource: {
    readonly type: 'WINNER';
    readonly sourceMatchKey: string;
  };
  readonly awaySource: {
    readonly type: 'LOSER';
    readonly sourceMatchKey: string;
  };
}

export type SportsGrandFinalOutcomePlan =
  | {
      readonly status: 'CHAMPIONSHIP_DECIDED';
      readonly winnerRegistrationId: string;
      readonly loserRegistrationId: string;
    }
  | {
      readonly status: 'RESET_REQUIRED';
      readonly resetHomeRegistrationId: string;
      readonly resetAwayRegistrationId: string;
    }
  | {
      readonly status: 'BLOCKED';
      readonly reason: 'PARTICIPANTS_MISSING' | 'WINNER_MISSING' | 'WINNER_NOT_IN_GRAND_FINAL';
    };

export interface SportsDoubleEliminationPlan {
  readonly entrantCount: number;
  readonly bracketSize: number;
  readonly winnersRounds: readonly (readonly SportsDoubleEliminationMatchPlan[])[];
  readonly losersRounds: readonly (readonly SportsDoubleEliminationMatchPlan[])[];
  readonly grandFinal: SportsDoubleEliminationMatchPlan;
  readonly grandFinalReset: SportsGrandFinalResetRule;
  readonly automaticAdvancements: readonly SportsAutomaticAdvancementPlan[];
}

export interface GenerateSportsDoubleEliminationInput {
  readonly entrants: readonly SportsBracketEntrant[];
  readonly seedingMode: SportsBracketSeedingMode;
  readonly random?: () => number;
}

type MutableSportsDoubleEliminationMatchPlan = Omit<SportsDoubleEliminationMatchPlan, 'advancements'> & {
  advancements: SportsDoubleEliminationAdvancement[];
};

const BYE_SLOT: SportsDoubleEliminationSlot = { type: 'BYE' };

export function generateSportsDoubleEliminationBracket(
  input: GenerateSportsDoubleEliminationInput,
): SportsDoubleEliminationPlan {
  const winners = generateSingleEliminationBracket(input);
  const winnersRounds = winners.rounds.map((round) =>
    round.matches.map((match) => ({
      key: winnersKey(match.key),
      stage: 'WINNERS' as const,
      roundNumber: match.roundNumber,
      position: match.position,
      home: prefixWinnerSlot(match.home),
      away: prefixWinnerSlot(match.away),
      advancements: [] as SportsDoubleEliminationAdvancement[],
      hasStructuralBye: match.automaticWinnerRegistrationId !== null,
      isStructurallyEmpty: false,
      automaticWinnerRegistrationId: match.automaticWinnerRegistrationId,
    })),
  );

  if (winners.bracketSize === 2) {
    const winnersFinal = winnersRounds[0][0];
    const grandFinal = createGrandFinal(
      {
        type: 'WINNER',
        sourceMatchKey: winnersFinal.key,
      },
      {
        type: 'LOSER',
        sourceMatchKey: winnersFinal.key,
      },
    );
    winnersFinal.advancements.push(
      advancement('WINNER', grandFinal.key, 'HOME'),
      advancement('LOSER', grandFinal.key, 'AWAY'),
    );
    return {
      entrantCount: winners.entrantCount,
      bracketSize: winners.bracketSize,
      winnersRounds,
      losersRounds: [],
      grandFinal,
      grandFinalReset: resetRule(grandFinal.key),
      automaticAdvancements: renameAutomaticAdvancements(winners.automaticAdvancements),
    };
  }

  const losersRounds = createLosersRounds(winnersRounds);
  const winnersFinal = winnersRounds[winnersRounds.length - 1][0];
  const losersFinal = losersRounds[losersRounds.length - 1][0];
  const grandFinal = createGrandFinal(
    {
      type: 'WINNER',
      sourceMatchKey: winnersFinal.key,
    },
    {
      type: 'WINNER',
      sourceMatchKey: losersFinal.key,
    },
  );

  wireWinnersAdvancements(winnersRounds, losersRounds, grandFinal.key);
  wireLosersAdvancements(losersRounds, grandFinal.key);

  return {
    entrantCount: winners.entrantCount,
    bracketSize: winners.bracketSize,
    winnersRounds,
    losersRounds,
    grandFinal,
    grandFinalReset: resetRule(grandFinal.key),
    automaticAdvancements: renameAutomaticAdvancements(winners.automaticAdvancements),
  };
}

/**
 * In a double-elimination grand final, the winners-bracket entrant occupies the
 * home slot and still has both lives. A home win decides the championship. An
 * away win is the winners-bracket entrant's first loss, so both registrations
 * must meet once more in the reset match.
 */
export function planSportsGrandFinalOutcome(input: {
  readonly homeRegistrationId: string | null;
  readonly awayRegistrationId: string | null;
  readonly winnerRegistrationId: string | null;
}): SportsGrandFinalOutcomePlan {
  if (!input.homeRegistrationId || !input.awayRegistrationId) {
    return { status: 'BLOCKED', reason: 'PARTICIPANTS_MISSING' };
  }
  if (!input.winnerRegistrationId) {
    return { status: 'BLOCKED', reason: 'WINNER_MISSING' };
  }
  if (
    input.winnerRegistrationId !== input.homeRegistrationId &&
    input.winnerRegistrationId !== input.awayRegistrationId
  ) {
    return { status: 'BLOCKED', reason: 'WINNER_NOT_IN_GRAND_FINAL' };
  }
  if (input.winnerRegistrationId === input.homeRegistrationId) {
    return {
      status: 'CHAMPIONSHIP_DECIDED',
      winnerRegistrationId: input.homeRegistrationId,
      loserRegistrationId: input.awayRegistrationId,
    };
  }
  return {
    status: 'RESET_REQUIRED',
    resetHomeRegistrationId: input.awayRegistrationId,
    resetAwayRegistrationId: input.homeRegistrationId,
  };
}

function createLosersRounds(
  winnersRounds: readonly (readonly MutableSportsDoubleEliminationMatchPlan[])[],
): MutableSportsDoubleEliminationMatchPlan[][] {
  const losersRounds: MutableSportsDoubleEliminationMatchPlan[][] = [];
  const firstWinnersRound = winnersRounds[0];
  const firstLosersRound: MutableSportsDoubleEliminationMatchPlan[] = [];

  for (let position = 1; position <= firstWinnersRound.length / 2; position += 1) {
    const firstSource = firstWinnersRound[(position - 1) * 2];
    const secondSource = firstWinnersRound[(position - 1) * 2 + 1];
    firstLosersRound.push(createLosersMatch(1, position, loserSlot(firstSource), loserSlot(secondSource)));
  }
  losersRounds.push(firstLosersRound);

  const losersRoundCount = (winnersRounds.length - 1) * 2;
  for (let roundNumber = 2; roundNumber <= losersRoundCount; roundNumber += 1) {
    const previousRound = losersRounds[roundNumber - 2];
    const matches: MutableSportsDoubleEliminationMatchPlan[] = [];

    if (roundNumber % 2 === 0) {
      const winnersRoundNumber = roundNumber / 2 + 1;
      const droppingMatches = winnersRounds[winnersRoundNumber - 1];
      for (let position = 1; position <= previousRound.length; position += 1) {
        const droppingPosition = previousRound.length - position + 1;
        matches.push(
          createLosersMatch(
            roundNumber,
            position,
            {
              ...winnerSlot(previousRound[position - 1]),
            },
            loserSlot(droppingMatches[droppingPosition - 1]),
          ),
        );
      }
    } else {
      for (let position = 1; position <= previousRound.length / 2; position += 1) {
        matches.push(
          createLosersMatch(
            roundNumber,
            position,
            {
              ...winnerSlot(previousRound[(position - 1) * 2]),
            },
            {
              ...winnerSlot(previousRound[(position - 1) * 2 + 1]),
            },
          ),
        );
      }
    }
    losersRounds.push(matches);
  }

  return losersRounds;
}

function wireWinnersAdvancements(
  winnersRounds: MutableSportsDoubleEliminationMatchPlan[][],
  losersRounds: readonly (readonly MutableSportsDoubleEliminationMatchPlan[])[],
  grandFinalKey: string,
): void {
  for (const round of winnersRounds) {
    for (const match of round) {
      const isFinal = match.roundNumber === winnersRounds.length;
      const winnerTarget = isFinal
        ? { key: grandFinalKey, side: 'HOME' as const }
        : {
            key: winnersRounds[match.roundNumber][Math.ceil(match.position / 2) - 1].key,
            side: match.position % 2 === 1 ? ('HOME' as const) : ('AWAY' as const),
          };

      const loserTarget =
        match.roundNumber === 1
          ? {
              key: losersRounds[0][Math.ceil(match.position / 2) - 1].key,
              side: match.position % 2 === 1 ? ('HOME' as const) : ('AWAY' as const),
            }
          : {
              key: losersRounds[(match.roundNumber - 1) * 2 - 1][
                winnersRounds[match.roundNumber - 1].length - match.position
              ].key,
              side: 'AWAY' as const,
            };

      match.advancements.push(advancement('WINNER', winnerTarget.key, winnerTarget.side));
      if (!match.automaticWinnerRegistrationId) {
        match.advancements.push(advancement('LOSER', loserTarget.key, loserTarget.side));
      }
    }
  }
}

function wireLosersAdvancements(
  losersRounds: MutableSportsDoubleEliminationMatchPlan[][],
  grandFinalKey: string,
): void {
  for (const round of losersRounds) {
    for (const match of round) {
      if (match.isStructurallyEmpty) {
        continue;
      }
      if (match.roundNumber === losersRounds.length) {
        match.advancements.push(advancement('WINNER', grandFinalKey, 'AWAY'));
        continue;
      }

      const nextRound = losersRounds[match.roundNumber];
      const targetPosition = nextRound.length === round.length ? match.position : Math.ceil(match.position / 2);
      const targetSide = nextRound.length === round.length ? 'HOME' : match.position % 2 === 1 ? 'HOME' : 'AWAY';
      match.advancements.push(advancement('WINNER', nextRound[targetPosition - 1].key, targetSide));
    }
  }
}

function createLosersMatch(
  roundNumber: number,
  position: number,
  home: SportsDoubleEliminationSlot,
  away: SportsDoubleEliminationSlot,
): MutableSportsDoubleEliminationMatchPlan {
  return {
    key: `LB-R${roundNumber}-M${position}`,
    stage: 'LOSERS',
    roundNumber,
    position,
    home,
    away,
    advancements: [],
    hasStructuralBye: home.type === 'BYE' || away.type === 'BYE',
    isStructurallyEmpty: home.type === 'BYE' && away.type === 'BYE',
    automaticWinnerRegistrationId: registrationOppositeBye(home, away),
  };
}

function createGrandFinal(
  home: SportsDoubleEliminationSlot,
  away: SportsDoubleEliminationSlot,
): MutableSportsDoubleEliminationMatchPlan {
  return {
    key: 'GF-R1-M1',
    stage: 'GRAND_FINAL',
    roundNumber: 1,
    position: 1,
    home,
    away,
    advancements: [],
    hasStructuralBye: false,
    isStructurallyEmpty: false,
    automaticWinnerRegistrationId: null,
  };
}

function loserSlot(source: MutableSportsDoubleEliminationMatchPlan): SportsDoubleEliminationSlot {
  if (source.automaticWinnerRegistrationId) {
    return BYE_SLOT;
  }
  return {
    type: 'LOSER',
    sourceMatchKey: source.key,
  };
}

function winnerSlot(source: MutableSportsDoubleEliminationMatchPlan): SportsDoubleEliminationSlot {
  if (source.isStructurallyEmpty) {
    return BYE_SLOT;
  }
  return {
    type: 'WINNER',
    sourceMatchKey: source.key,
  };
}

function prefixWinnerSlot(slot: SportsBracketSlot): SportsDoubleEliminationSlot {
  if (slot.type !== 'WINNER') {
    return slot;
  }
  return {
    type: 'WINNER',
    sourceMatchKey: winnersKey(slot.sourceMatchKey),
  };
}

function registrationOppositeBye(home: SportsDoubleEliminationSlot, away: SportsDoubleEliminationSlot): string | null {
  if (home.type === 'REGISTRATION' && away.type === 'BYE') {
    return home.registrationId;
  }
  if (away.type === 'REGISTRATION' && home.type === 'BYE') {
    return away.registrationId;
  }
  return null;
}

function advancement(
  outcome: SportsBracketOutcome,
  targetMatchKey: string,
  targetSide: SportsBracketSide,
): SportsDoubleEliminationAdvancement {
  return { outcome, targetMatchKey, targetSide };
}

function resetRule(grandFinalKey: string): SportsGrandFinalResetRule {
  return {
    requiredWhenGrandFinalWinnerEnteredFrom: 'LOSERS',
    homeSource: {
      type: 'WINNER',
      sourceMatchKey: grandFinalKey,
    },
    awaySource: {
      type: 'LOSER',
      sourceMatchKey: grandFinalKey,
    },
  };
}

function renameAutomaticAdvancements(
  plans: readonly SportsAutomaticAdvancementPlan[],
): SportsAutomaticAdvancementPlan[] {
  return plans.map((plan) => ({
    ...plan,
    sourceMatchKey: winnersKey(plan.sourceMatchKey),
    targetMatchKey: winnersKey(plan.targetMatchKey),
  }));
}

function winnersKey(key: string): string {
  return `WB-${key}`;
}
