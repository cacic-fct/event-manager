export const SPORTS_OVERALL_SCORING_MODES = [
  'NONE',
  'MATCH_RESULT',
  'FINAL_PLACEMENT',
  'MATCH_RESULT_AND_FINAL_PLACEMENT',
] as const;

export type SportsOverallScoringMode = (typeof SPORTS_OVERALL_SCORING_MODES)[number];

export interface SportsOverallScoringRules {
  mode: SportsOverallScoringMode;
  match: {
    win: number;
    draw: number;
    loss: number;
  };
  placement: Readonly<Record<string, number>>;
}

const DEFAULT_MATCH_POINTS = { win: 0, draw: 0, loss: 0 };
const MAX_AUTOMATIC_POINTS = 1_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidPoints(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_AUTOMATIC_POINTS;
}

function readMatchPoints(value: unknown): SportsOverallScoringRules['match'] {
  if (!isRecord(value)) {
    return DEFAULT_MATCH_POINTS;
  }
  return {
    win: isValidPoints(value['win']) ? value['win'] : 0,
    draw: isValidPoints(value['draw']) ? value['draw'] : 0,
    loss: isValidPoints(value['loss']) ? value['loss'] : 0,
  };
}

function readPlacementPoints(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      ([placement, points]) =>
        /^\d+$/.test(placement) && Number(placement) > 0 && Number(placement) <= 100 && isValidPoints(points),
    ),
  ) as Record<string, number>;
}

function inferMode(hasMatchPoints: boolean, hasPlacementPoints: boolean): SportsOverallScoringMode {
  if (hasMatchPoints && hasPlacementPoints) {
    return 'MATCH_RESULT_AND_FINAL_PLACEMENT';
  }
  if (hasMatchPoints) {
    return 'MATCH_RESULT';
  }
  if (hasPlacementPoints) {
    return 'FINAL_PLACEMENT';
  }
  return 'NONE';
}

export function normalizeSportsOverallScoringRules(
  value: unknown,
  legacyPlacementPoints?: unknown,
): SportsOverallScoringRules {
  const rules = isRecord(value) ? value : {};
  const match = readMatchPoints(rules['match']);
  const hasMatchPoints =
    isRecord(rules['match']) && Object.keys(rules['match']).some((key) => key in DEFAULT_MATCH_POINTS);
  const hasExplicitPlacement = Object.prototype.hasOwnProperty.call(rules, 'placement');
  const placement = hasExplicitPlacement
    ? readPlacementPoints(rules['placement'])
    : readPlacementPoints(legacyPlacementPoints);
  const hasPlacementPoints = Object.keys(placement).length > 0;
  const mode = SPORTS_OVERALL_SCORING_MODES.includes(rules['mode'] as SportsOverallScoringMode)
    ? (rules['mode'] as SportsOverallScoringMode)
    : inferMode(hasMatchPoints, hasPlacementPoints);

  return { mode, match, placement };
}

export function assertSportsOverallScoringRules(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('As regras de pontuação geral devem ser um objeto JSON.');
  }
  const allowedKeys = new Set(['mode', 'match', 'placement']);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length) {
    throw new Error(`Campos desconhecidos nas regras de pontuação geral: ${unknownKeys.join(', ')}.`);
  }
  if (
    value['mode'] !== undefined &&
    !SPORTS_OVERALL_SCORING_MODES.includes(value['mode'] as SportsOverallScoringMode)
  ) {
    throw new Error('mode deve ser NONE, MATCH_RESULT, FINAL_PLACEMENT ou MATCH_RESULT_AND_FINAL_PLACEMENT.');
  }
  if (value['match'] !== undefined) {
    if (!isRecord(value['match'])) {
      throw new Error('match deve ser um objeto JSON.');
    }
    const unknownMatchKeys = Object.keys(value['match']).filter((key) => !['win', 'draw', 'loss'].includes(key));
    if (unknownMatchKeys.length) {
      throw new Error(`Campos desconhecidos em match: ${unknownMatchKeys.join(', ')}.`);
    }
    for (const key of ['win', 'draw', 'loss']) {
      const points = value['match'][key];
      if (points !== undefined && !isValidPoints(points)) {
        throw new Error(`${key} em match deve ser um inteiro entre 0 e ${MAX_AUTOMATIC_POINTS}.`);
      }
    }
  }
  if (value['placement'] !== undefined) {
    if (!isRecord(value['placement'])) {
      throw new Error('placement deve ser um objeto JSON.');
    }
    for (const [placement, points] of Object.entries(value['placement'])) {
      if (!/^\d+$/.test(placement) || Number(placement) < 1 || Number(placement) > 100) {
        throw new Error('As posições em placement devem ser inteiros entre 1 e 100.');
      }
      if (!isValidPoints(points)) {
        throw new Error(`${placement} em placement deve ser um inteiro entre 0 e ${MAX_AUTOMATIC_POINTS}.`);
      }
    }
  }
}

export function sportsOverallScoringUsesMatchResult(mode: SportsOverallScoringMode): boolean {
  return mode === 'MATCH_RESULT' || mode === 'MATCH_RESULT_AND_FINAL_PLACEMENT';
}

export function sportsOverallScoringUsesFinalPlacement(mode: SportsOverallScoringMode): boolean {
  return mode === 'FINAL_PLACEMENT' || mode === 'MATCH_RESULT_AND_FINAL_PLACEMENT';
}
