export type SportsScoreSide = 'HOME' | 'AWAY';

export interface SportsScorePeriod {
  readonly number: number;
  readonly label: string;
  readonly home: number;
  readonly away: number;
  readonly closed: boolean;
}

export interface SportsScoreboard {
  readonly home: number;
  readonly away: number;
  readonly periods: readonly SportsScorePeriod[];
  readonly activePeriodNumber: number | null;
}

export interface SportsScoreDelta {
  readonly side: SportsScoreSide;
  readonly amount: number;
  readonly periodNumber?: number | null;
}

export interface RollSportsScorePeriodOptions {
  readonly label?: string;
  readonly maximumPeriods?: number | null;
}

const EMPTY_SCOREBOARD: SportsScoreboard = {
  home: 0,
  away: 0,
  periods: [],
  activePeriodNumber: null,
};

export function normalizeSportsScoreboard(input: unknown): SportsScoreboard {
  if (input === null || input === undefined) {
    return { ...EMPTY_SCOREBOARD };
  }
  if (!isRecord(input)) {
    throw new TypeError('Sports scoreboard must be an object.');
  }

  const periods = normalizePeriods(input.periods);
  const activePeriodNumber = normalizeActivePeriod(input.activePeriodNumber, periods);

  return {
    home: normalizeScore(input.home, 'home'),
    away: normalizeScore(input.away, 'away'),
    periods,
    activePeriodNumber,
  };
}

export function applySportsScoreDelta(
  scoreboard: SportsScoreboard,
  delta: SportsScoreDelta,
): SportsScoreboard {
  const normalized = normalizeSportsScoreboard(scoreboard);
  assertFiniteNumber(delta.amount, 'Score delta');
  if (delta.amount === 0) {
    return normalized;
  }

  const nextHome = delta.side === 'HOME' ? normalized.home + delta.amount : normalized.home;
  const nextAway = delta.side === 'AWAY' ? normalized.away + delta.amount : normalized.away;
  assertNonNegativeScore(nextHome, 'home');
  assertNonNegativeScore(nextAway, 'away');

  const periodNumber = delta.periodNumber ?? normalized.activePeriodNumber;
  if (periodNumber === null) {
    return {
      ...normalized,
      home: nextHome,
      away: nextAway,
    };
  }
  if (!Number.isInteger(periodNumber) || periodNumber < 1) {
    throw new RangeError('Score period number must be a positive integer.');
  }

  let foundPeriod = false;
  const periods = normalized.periods.map((period) => {
    if (period.number !== periodNumber) {
      return period;
    }
    if (period.closed) {
      throw new Error('Closed score periods cannot receive live score deltas.');
    }

    foundPeriod = true;
    const home = delta.side === 'HOME' ? period.home + delta.amount : period.home;
    const away = delta.side === 'AWAY' ? period.away + delta.amount : period.away;
    assertNonNegativeScore(home, `period ${periodNumber} home`);
    assertNonNegativeScore(away, `period ${periodNumber} away`);
    return { ...period, home, away };
  });

  if (!foundPeriod) {
    throw new Error(`Score period ${periodNumber} does not exist.`);
  }

  return {
    home: nextHome,
    away: nextAway,
    periods,
    activePeriodNumber: normalized.activePeriodNumber,
  };
}

export function rollSportsScorePeriod(
  scoreboard: SportsScoreboard,
  options: RollSportsScorePeriodOptions = {},
): SportsScoreboard {
  const normalized = normalizeSportsScoreboard(scoreboard);
  validateMaximumPeriods(options.maximumPeriods);

  const nextPeriodNumber =
    normalized.periods.reduce((maximum, period) => Math.max(maximum, period.number), 0) + 1;
  if (options.maximumPeriods !== null && options.maximumPeriods !== undefined) {
    if (nextPeriodNumber > options.maximumPeriods) {
      throw new Error(`The configured maximum of ${options.maximumPeriods} periods was reached.`);
    }
  }

  const periods = normalized.periods.map((period) =>
    period.number === normalized.activePeriodNumber ? { ...period, closed: true } : period,
  );
  const label = options.label?.trim() || 'Período';

  return {
    ...normalized,
    periods: [
      ...periods,
      {
        number: nextPeriodNumber,
        label: `${label} ${nextPeriodNumber}`,
        home: 0,
        away: 0,
        closed: false,
      },
    ],
    activePeriodNumber: nextPeriodNumber,
  };
}

export function closeActiveSportsScorePeriod(scoreboard: SportsScoreboard): SportsScoreboard {
  const normalized = normalizeSportsScoreboard(scoreboard);
  if (normalized.activePeriodNumber === null) {
    return normalized;
  }

  return {
    ...normalized,
    periods: normalized.periods.map((period) =>
      period.number === normalized.activePeriodNumber ? { ...period, closed: true } : period,
    ),
    activePeriodNumber: null,
  };
}

function normalizePeriods(input: unknown): SportsScorePeriod[] {
  if (input === undefined) {
    return [];
  }
  if (!Array.isArray(input)) {
    throw new TypeError('Sports scoreboard periods must be an array.');
  }

  const seen = new Set<number>();
  const periods = input.map((value, index) => {
    if (!isRecord(value)) {
      throw new TypeError(`Sports scoreboard period ${index + 1} must be an object.`);
    }

    const number = value.number;
    if (!Number.isInteger(number) || (number as number) < 1) {
      throw new RangeError(`Sports scoreboard period ${index + 1} must have a positive integer number.`);
    }
    if (seen.has(number as number)) {
      throw new Error(`Sports scoreboard period number ${number as number} is duplicated.`);
    }
    seen.add(number as number);

    const label = value.label;
    if (typeof label !== 'string' || !label.trim()) {
      throw new TypeError(`Sports scoreboard period ${number as number} must have a label.`);
    }
    if (typeof value.closed !== 'boolean') {
      throw new TypeError(`Sports scoreboard period ${number as number} must declare whether it is closed.`);
    }

    return {
      number: number as number,
      label: label.trim(),
      home: normalizeScore(value.home, `period ${number as number} home`),
      away: normalizeScore(value.away, `period ${number as number} away`),
      closed: value.closed,
    };
  });

  return periods.sort((left, right) => left.number - right.number);
}

function normalizeActivePeriod(input: unknown, periods: readonly SportsScorePeriod[]): number | null {
  if (input === undefined || input === null) {
    if (periods.some((period) => !period.closed)) {
      throw new Error('An open score period must be selected as the active period.');
    }
    return null;
  }
  if (!Number.isInteger(input) || (input as number) < 1) {
    throw new RangeError('Active score period must be a positive integer or null.');
  }

  const activePeriod = periods.find((period) => period.number === input);
  if (!activePeriod) {
    throw new Error(`Active score period ${input as number} does not exist.`);
  }
  if (activePeriod.closed) {
    throw new Error(`Active score period ${input as number} is closed.`);
  }
  if (periods.some((period) => !period.closed && period.number !== input)) {
    throw new Error('Only one score period can be open at a time.');
  }
  return input as number;
}

function normalizeScore(value: unknown, path: string): number {
  if (value === undefined) {
    return 0;
  }
  assertFiniteNumber(value, `Sports scoreboard ${path}`);
  assertNonNegativeScore(value, path);
  return value;
}

function assertFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
}

function assertNonNegativeScore(value: number, path: string): void {
  if (value < 0) {
    throw new RangeError(`Sports scoreboard ${path} cannot be negative.`);
  }
}

function validateMaximumPeriods(maximumPeriods: number | null | undefined): void {
  if (
    maximumPeriods !== null &&
    maximumPeriods !== undefined &&
    (!Number.isInteger(maximumPeriods) || maximumPeriods < 1)
  ) {
    throw new RangeError('Maximum periods must be a positive integer or null.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
