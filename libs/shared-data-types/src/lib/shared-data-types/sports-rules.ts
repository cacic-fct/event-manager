import type { SportsScoreStrategy } from './sports-metadata';

export interface SportsScoreRules {
  readonly strategy: SportsScoreStrategy;
  readonly allowDraw: boolean;
  readonly higherWins: boolean;
  readonly pointStep: number;
}

export const DEFAULT_SPORTS_SCORE_RULES: SportsScoreRules = {
  strategy: 'TOTAL',
  allowDraw: true,
  higherWins: true,
  pointStep: 1,
};

export interface SportsStandingsRules {
  readonly winPoints: number;
  readonly drawPoints: number;
  readonly lossPoints: number;
  readonly byePoints: number;
}

export const DEFAULT_SPORTS_STANDINGS_RULES: SportsStandingsRules = {
  winPoints: 3,
  drawPoints: 1,
  lossPoints: 0,
  byePoints: 3,
};

export interface SportsBracketEditorRules {
  readonly groupCount: number;
  readonly qualifiersPerGroup: number;
  readonly swissMaximumRounds: number;
}

export const DEFAULT_SPORTS_BRACKET_EDITOR_RULES: SportsBracketEditorRules = {
  groupCount: 2,
  qualifiersPerGroup: 2,
  swissMaximumRounds: 5,
};

export type SportsOverallScoringMode =
  | 'NONE'
  | 'MATCH_RESULT'
  | 'FINAL_PLACEMENT'
  | 'MATCH_RESULT_AND_FINAL_PLACEMENT';

export interface SportsOverallScoringRules {
  readonly mode: SportsOverallScoringMode;
  readonly match: {
    readonly win: number;
    readonly draw: number;
    readonly loss: number;
  };
}

export const DEFAULT_SPORTS_OVERALL_SCORING_RULES: SportsOverallScoringRules = {
  mode: 'NONE',
  match: {
    win: 3,
    draw: 1,
    loss: 0,
  },
};

export function normalizeSportsScoreRules(value: unknown): SportsScoreRules {
  if (!isRecord(value)) {
    return DEFAULT_SPORTS_SCORE_RULES;
  }
  const strategy = value['strategy'];
  const pointStep = value['pointStep'];
  return {
    strategy:
      strategy === 'TOTAL' ||
      strategy === 'SETS' ||
      strategy === 'ROUNDS' ||
      strategy === 'PLACEMENT' ||
      strategy === 'CUSTOM'
        ? strategy
        : DEFAULT_SPORTS_SCORE_RULES.strategy,
    allowDraw:
      typeof value['allowDraw'] === 'boolean' ? value['allowDraw'] : DEFAULT_SPORTS_SCORE_RULES.allowDraw,
    higherWins:
      typeof value['higherWins'] === 'boolean' ? value['higherWins'] : DEFAULT_SPORTS_SCORE_RULES.higherWins,
    pointStep:
      typeof pointStep === 'number' && Number.isFinite(pointStep) && pointStep > 0
        ? pointStep
        : DEFAULT_SPORTS_SCORE_RULES.pointStep,
  };
}

export function assertSportsScoreDeltaMatchesRules(amount: number, rules: SportsScoreRules): void {
  if (!Number.isFinite(amount)) {
    throw new RangeError('A alteração de placar deve ser um número finito.');
  }
  const units = Math.abs(amount) / rules.pointStep;
  if (Math.abs(units - Math.round(units)) > 1e-9) {
    throw new RangeError(`A alteração de placar deve respeitar o passo de ${rules.pointStep}.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
