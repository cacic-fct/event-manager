import { SportsLossReason, SportsMatchActionType, SportsMatchState, SportsReviewStatus } from '@prisma/client';
import {
  applySportsScoreDelta,
  closeActiveSportsScorePeriod,
  normalizeSportsScoreboard,
  rollSportsScorePeriod,
  SportsScoreboard,
} from '../domain/sports-scoreboard';
import {
  SportsProjectedOutcome,
  SportsProjectedPeriodTimer,
  SportsProjectionAction,
} from './sports-match-projection.models';
import { createSportsProjectionReset } from './sports-match-projection.defaults';

export type {
  SportsProjectedOutcome,
  SportsProjectedPeriodTimer,
  SportsProjectionAction,
} from './sports-match-projection.models';

export function projectSportsMatch(
  actions: readonly SportsProjectionAction[],
  options: {
    approvedOnly: boolean;
    hasCheckedInPlayers: boolean;
    maximumPeriods: number | null;
    periodLabel: string | null;
    periodsEnabled?: boolean;
    timerRules?: unknown;
  },
): SportsProjectedOutcome {
  const configuredTimers = timerRules(options.timerRules);
  let projection: SportsProjectedOutcome = {
    state: options.hasCheckedInPlayers ? SportsMatchState.CHECK_IN : SportsMatchState.SCHEDULED,
    scoreboard: normalizeSportsScoreboard(undefined),
    winnerRegistrationId: null,
    loserRegistrationId: null,
    lossReason: null,
    lossReasonDetail: null,
    drawWillReschedule: null,
    timerStartedAt: null,
    timerPausedAt: null,
    elapsedBeforePauseMs: 0,
    periodTimers: [],
    overallTimerEnabled: configuredTimers.overallEnabled,
    periodTimerEnabled: configuredTimers.periodEnabled,
    timerPeriodDurationMs: configuredTimers.periodDurationMs,
    timerPeriodStartOffsetsMs: configuredTimers.periodStartOffsetsMs,
    timerAllowOvertime: configuredTimers.allowOvertime,
  };

  for (const action of actions) {
    if (
      action.reviewStatus === SportsReviewStatus.REJECTED ||
      action.reviewStatus === SportsReviewStatus.CHANGES_REQUESTED ||
      (options.approvedOnly && action.reviewStatus !== SportsReviewStatus.APPROVED)
    ) {
      continue;
    }
    try {
      projection = applyAction(projection, action, options);
    } catch {
      // An action can become invalid when an earlier offline action is rejected.
      // It stays in the review log, but must not corrupt the public projection.
    }
  }
  return projection;
}

function applyAction(
  current: SportsProjectedOutcome,
  action: SportsProjectionAction,
  options: {
    maximumPeriods: number | null;
    periodLabel: string | null;
    periodsEnabled?: boolean;
    timerRules?: unknown;
  },
): SportsProjectedOutcome {
  const payload = requireRecord(action.payload);
  switch (action.type) {
    case SportsMatchActionType.CHECK_IN:
      if (payload['kind'] === 'NON_ROSTER_ATTENDANCE_SCAN' || payload['present'] === false) {
        return current;
      }
      return {
        ...current,
        state: current.state === SportsMatchState.SCHEDULED ? SportsMatchState.CHECK_IN : current.state,
      };
    case SportsMatchActionType.START:
      assertState(current.state, [SportsMatchState.SCHEDULED, SportsMatchState.CHECK_IN]);
      return {
        ...current,
        state: SportsMatchState.LIVE,
        scoreboard:
          (options.periodsEnabled ?? options.maximumPeriods !== null) && current.scoreboard.periods.length === 0
            ? rollSportsScorePeriod(current.scoreboard, {
                maximumPeriods: options.maximumPeriods,
                label: options.periodLabel ?? undefined,
              })
            : current.scoreboard,
        timerStartedAt: action.authoredAt,
        timerPausedAt: null,
        periodTimers: !current.periodTimerEnabled
          ? []
          : current.periodTimers.length
            ? current.periodTimers
            : [startPeriodTimer(1, action.authoredAt, options.timerRules)],
      };
    case SportsMatchActionType.PAUSE:
      assertState(current.state, [SportsMatchState.LIVE]);
      return {
        ...current,
        state: SportsMatchState.PAUSED,
        elapsedBeforePauseMs:
          current.elapsedBeforePauseMs +
          Math.max(0, action.authoredAt.getTime() - (current.timerStartedAt?.getTime() ?? action.authoredAt.getTime())),
        timerStartedAt: null,
        timerPausedAt: action.authoredAt,
        periodTimers: pauseActivePeriod(current.periodTimers, action.authoredAt),
      };
    case SportsMatchActionType.RESUME:
      assertState(current.state, [SportsMatchState.PAUSED]);
      return {
        ...current,
        state: SportsMatchState.LIVE,
        timerStartedAt: action.authoredAt,
        timerPausedAt: null,
        periodTimers: resumeActivePeriod(current.periodTimers, action.authoredAt),
      };
    case SportsMatchActionType.SCORE_DELTA:
      assertState(current.state, [SportsMatchState.LIVE, SportsMatchState.PAUSED]);
      return {
        ...current,
        scoreboard: applySportsScoreDelta(current.scoreboard, {
          side: requireSide(payload['side']),
          amount: requireFiniteNumber(payload['amount'], 'amount'),
          periodNumber: readOptionalInteger(payload['periodNumber']),
        }),
      };
    case SportsMatchActionType.SCORE_CORRECTION: {
      const scoreboard = normalizeSportsScoreboard(payload['scoreboard']);
      const stopwatch = payload['stopwatch'];
      if (stopwatch === undefined) {
        return {
          ...current,
          scoreboard,
        };
      }
      return restoreSportsStopwatch(current, scoreboard, stopwatch, options);
    }
    case SportsMatchActionType.PERIOD_ROLL: {
      assertState(current.state, [SportsMatchState.LIVE, SportsMatchState.PAUSED]);
      const wasPaused = current.state === SportsMatchState.PAUSED;
      const nextPeriod = (current.scoreboard.activePeriodNumber ?? current.scoreboard.periods.length) + 1;
      const closedTimers = pauseActivePeriod(current.periodTimers, action.authoredAt);
      const nextTimer = startPeriodTimer(nextPeriod, action.authoredAt, options.timerRules, wasPaused);
      return {
        ...current,
        scoreboard: rollSportsScorePeriod(current.scoreboard, {
          maximumPeriods: options.maximumPeriods,
          label: typeof payload['label'] === 'string' ? payload['label'] : (options.periodLabel ?? undefined),
        }),
        // Competition clocks use their scheduled period baseline (for example
        // soccer's second half starts at 45:00 even when the first lasted 47:00).
        elapsedBeforePauseMs: nextTimer.scheduledStartOffsetMs,
        timerStartedAt: wasPaused ? null : action.authoredAt,
        timerPausedAt: wasPaused ? (current.timerPausedAt ?? action.authoredAt) : null,
        periodTimers: current.periodTimerEnabled ? [...closedTimers, nextTimer] : [],
      };
    }
    case SportsMatchActionType.TIMER_RECONCILE:
      return applyTimerReconciliation(current, payload, options);
    case SportsMatchActionType.OCCURRENCE:
      return current;
    case SportsMatchActionType.FINALIZE:
    case SportsMatchActionType.FORFEIT: {
      assertState(current.state, [
        SportsMatchState.SCHEDULED,
        SportsMatchState.CHECK_IN,
        SportsMatchState.LIVE,
        SportsMatchState.PAUSED,
      ]);
      const draw = payload['draw'] === true;
      const scoreboard =
        payload['scoreboard'] === undefined ? current.scoreboard : normalizeSportsScoreboard(payload['scoreboard']);
      const stopped = stopTimer(current, action.authoredAt);
      return {
        ...stopped,
        state: draw ? SportsMatchState.DRAW : SportsMatchState.FINISHED,
        scoreboard: closeActiveSportsScorePeriod(scoreboard),
        winnerRegistrationId: draw ? null : readOptionalString(payload['winnerRegistrationId']),
        loserRegistrationId: draw ? null : readOptionalString(payload['loserRegistrationId']),
        lossReason: draw ? null : readLossReason(payload['lossReason']),
        lossReasonDetail: draw ? null : readOptionalString(payload['lossReasonDetail']),
        drawWillReschedule: draw ? payload['drawWillReschedule'] === true : null,
        timerStartedAt: null,
      };
    }
    case SportsMatchActionType.CANCEL: {
      assertState(current.state, [
        SportsMatchState.SCHEDULED,
        SportsMatchState.CHECK_IN,
        SportsMatchState.LIVE,
        SportsMatchState.PAUSED,
      ]);
      const stopped = stopTimer(current, action.authoredAt);
      return {
        ...stopped,
        state: SportsMatchState.CANCELED,
        winnerRegistrationId: null,
        loserRegistrationId: null,
        lossReason: null,
        lossReasonDetail: readOptionalString(payload['reason']),
        drawWillReschedule: payload['willReschedule'] !== false,
        timerStartedAt: null,
      };
    }
    case SportsMatchActionType.RESCHEDULE:
    case SportsMatchActionType.RESET:
      return {
        ...createSportsProjectionReset(),
        state: SportsMatchState.SCHEDULED,
        overallTimerEnabled: current.overallTimerEnabled,
        periodTimerEnabled: current.periodTimerEnabled,
        timerPeriodDurationMs: current.timerPeriodDurationMs,
        timerPeriodStartOffsetsMs: current.timerPeriodStartOffsetsMs,
        timerAllowOvertime: current.timerAllowOvertime,
      };
    default:
      return current;
  }
}

function stopTimer(current: SportsProjectedOutcome, at: Date): SportsProjectedOutcome {
  return {
    ...current,
    elapsedBeforePauseMs:
      current.elapsedBeforePauseMs +
      (current.state === SportsMatchState.LIVE && current.timerStartedAt
        ? Math.max(0, at.getTime() - current.timerStartedAt.getTime())
        : 0),
    timerStartedAt: null,
    timerPausedAt:
      current.state === SportsMatchState.LIVE || current.state === SportsMatchState.PAUSED ? at : current.timerPausedAt,
    periodTimers: pauseActivePeriod(current.periodTimers, at),
  };
}

function timerRules(value: unknown): {
  overallEnabled: boolean;
  periodEnabled: boolean;
  periodDurationMs: number | null;
  periodStartOffsetsMs: number[];
  allowOvertime: boolean;
} {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    overallEnabled: record['overallEnabled'] !== false,
    periodEnabled: record['periodEnabled'] !== false,
    periodDurationMs: Number.isSafeInteger(record['periodDurationMs']) ? (record['periodDurationMs'] as number) : null,
    periodStartOffsetsMs: Array.isArray(record['periodStartOffsetsMs'])
      ? record['periodStartOffsetsMs'].filter((entry): entry is number => Number.isSafeInteger(entry) && entry >= 0)
      : [],
    allowOvertime: record['allowOvertime'] !== false,
  };
}

function startPeriodTimer(
  periodNumber: number,
  at: Date,
  rawRules: unknown,
  paused = false,
): SportsProjectedPeriodTimer {
  const rules = timerRules(rawRules);
  return {
    periodNumber,
    startedAtUnixMs: paused ? null : at.getTime(),
    pausedAtUnixMs: paused ? at.getTime() : null,
    elapsedBeforePauseMs: 0,
    scheduledStartOffsetMs:
      rules.periodStartOffsetsMs[periodNumber - 1] ?? (rules.periodDurationMs ?? 0) * (periodNumber - 1),
    capMs: rules.periodDurationMs,
    allowOvertime: rules.allowOvertime,
  };
}

function pauseActivePeriod(timers: SportsProjectedPeriodTimer[], at: Date): SportsProjectedPeriodTimer[] {
  return timers.map((timer, index) =>
    index !== timers.length - 1 || timer.startedAtUnixMs === null
      ? timer
      : {
          ...timer,
          elapsedBeforePauseMs: timer.elapsedBeforePauseMs + Math.max(0, at.getTime() - timer.startedAtUnixMs),
          startedAtUnixMs: null,
          pausedAtUnixMs: at.getTime(),
        },
  );
}

function resumeActivePeriod(timers: SportsProjectedPeriodTimer[], at: Date): SportsProjectedPeriodTimer[] {
  return timers.map((timer, index) =>
    index !== timers.length - 1 ? timer : { ...timer, startedAtUnixMs: at.getTime(), pausedAtUnixMs: null },
  );
}

function applyTimerReconciliation(
  current: SportsProjectedOutcome,
  payload: Record<string, unknown>,
  options: { maximumPeriods: number | null; periodLabel: string | null },
): SportsProjectedOutcome {
  const resolution = payload['resolution'];
  if (resolution !== 'SERVER' && resolution !== 'DEVICE') {
    throw new TypeError('Timer reconciliation resolution must be SERVER or DEVICE.');
  }
  if (resolution === 'SERVER') {
    return current;
  }
  const overall = requireRecord(payload['overall']);
  const periods = payload['periods'];
  if (!Array.isArray(periods)) {
    throw new TypeError('Timer reconciliation periods must be an array.');
  }
  const readUnixMs = (value: unknown): number | null =>
    Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;
  const activePeriodNumber =
    payload['activePeriodNumber'] == null
      ? null
      : requirePositiveInteger(payload['activePeriodNumber'], 'activePeriodNumber');
  const state = payload['state'];
  if (state !== SportsMatchState.LIVE && state !== SportsMatchState.PAUSED) {
    throw new TypeError('Timer reconciliation state must be LIVE or PAUSED.');
  }
  return {
    ...current,
    state,
    scoreboard: reconcileScoreboardActivePeriod(current.scoreboard, activePeriodNumber, options),
    timerStartedAt:
      readUnixMs(overall['startedAtUnixMs']) === null
        ? null
        : new Date(readUnixMs(overall['startedAtUnixMs']) as number),
    timerPausedAt:
      readUnixMs(overall['pausedAtUnixMs']) === null ? null : new Date(readUnixMs(overall['pausedAtUnixMs']) as number),
    elapsedBeforePauseMs: requireNonNegativeInteger(overall['elapsedBeforePauseMs'], 'elapsedBeforePauseMs'),
    periodTimers: periods.map((entry, index) => {
      const timer = requireRecord(entry);
      return {
        periodNumber: requirePositiveInteger(timer['periodNumber'], 'periodNumber'),
        startedAtUnixMs: readUnixMs(timer['startedAtUnixMs']),
        pausedAtUnixMs: readUnixMs(timer['pausedAtUnixMs']),
        elapsedBeforePauseMs: requireNonNegativeInteger(
          timer['elapsedBeforePauseMs'],
          `periods[${index}].elapsedBeforePauseMs`,
        ),
        scheduledStartOffsetMs: requireNonNegativeInteger(
          timer['scheduledStartOffsetMs'],
          `periods[${index}].scheduledStartOffsetMs`,
        ),
        capMs: timer['capMs'] == null ? null : requireNonNegativeInteger(timer['capMs'], `periods[${index}].capMs`),
        allowOvertime: timer['allowOvertime'] !== false,
      };
    }),
  };
}

export function restoreSportsStopwatch(
  current: SportsProjectedOutcome,
  scoreboard: SportsScoreboard,
  value: unknown,
  options: { maximumPeriods: number | null; periodLabel: string | null },
): SportsProjectedOutcome {
  const stopwatch = requireRecord(value);
  const state = stopwatch['state'];
  if (state !== SportsMatchState.LIVE && state !== SportsMatchState.PAUSED) {
    throw new TypeError('Stopwatch restoration state must be LIVE or PAUSED.');
  }
  const activePeriod = stopwatch['activePeriod'];
  if (
    activePeriod !== scoreboard.activePeriodNumber &&
    !(activePeriod === null && scoreboard.activePeriodNumber === null)
  ) {
    throw new TypeError('Stopwatch restoration active period must match the corrected scoreboard.');
  }
  const restored = applyTimerReconciliation(
    current,
    {
      resolution: 'DEVICE',
      overall: stopwatch['overall'],
      periods: stopwatch['periods'],
      activePeriodNumber: scoreboard.activePeriodNumber,
      state,
    },
    options,
  );
  return {
    ...restored,
    state,
    scoreboard,
  };
}

function reconcileScoreboardActivePeriod(
  scoreboard: SportsScoreboard,
  activePeriodNumber: number | null,
  options: { maximumPeriods: number | null; periodLabel: string | null },
): SportsScoreboard {
  let reconciled = normalizeSportsScoreboard(scoreboard);
  if (activePeriodNumber === null) {
    return closeActiveSportsScorePeriod(reconciled);
  }
  let highestPeriod = reconciled.periods.reduce((highest, period) => Math.max(highest, period.number), 0);
  while (highestPeriod < activePeriodNumber) {
    reconciled = rollSportsScorePeriod(reconciled, {
      maximumPeriods: options.maximumPeriods,
      label: options.periodLabel ?? undefined,
    });
    highestPeriod = reconciled.periods.reduce((highest, period) => Math.max(highest, period.number), 0);
  }
  // Moving backward must preserve later period scores for audit/review. Only
  // the selected period is reopened; every other period remains present/closed.
  return normalizeSportsScoreboard({
    ...reconciled,
    periods: reconciled.periods.map((period) => ({
      ...period,
      closed: period.number !== activePeriodNumber,
    })),
    activePeriodNumber,
  });
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  }
  return value as number;
}

function requirePositiveInteger(value: unknown, label: string): number {
  const number = requireNonNegativeInteger(value, label);
  if (number < 1) throw new TypeError(`${label} must be positive.`);
  return number;
}

function assertState(current: SportsMatchState, allowed: SportsMatchState[]): void {
  if (!allowed.includes(current)) {
    throw new Error(`Sports match action is invalid while state is ${current}.`);
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Sports match action payload must be an object.');
  }
  return value as Record<string, unknown>;
}

function requireSide(value: unknown): 'HOME' | 'AWAY' {
  if (value !== 'HOME' && value !== 'AWAY') {
    throw new TypeError('Score side must be HOME or AWAY.');
  }
  return value;
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be a finite number.`);
  }
  return value;
}

function readOptionalInteger(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new TypeError('Period number must be a positive integer.');
  }
  return value as number;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readLossReason(value: unknown): SportsLossReason {
  if (typeof value !== 'string' || !Object.values(SportsLossReason).includes(value as SportsLossReason)) {
    throw new TypeError('Loss reason is invalid.');
  }
  return value as SportsLossReason;
}
