import {
  SportsLossReason,
  SportsMatchActionType,
  SportsMatchState,
  SportsReviewStatus,
} from '@prisma/client';
import {
  applySportsScoreDelta,
  closeActiveSportsScorePeriod,
  normalizeSportsScoreboard,
  rollSportsScorePeriod,
  SportsScoreboard,
} from '../domain/sports-scoreboard';

export interface SportsProjectedOutcome {
  state: SportsMatchState;
  scoreboard: SportsScoreboard;
  winnerRegistrationId: string | null;
  loserRegistrationId: string | null;
  lossReason: SportsLossReason | null;
  lossReasonDetail: string | null;
  drawWillReschedule: boolean | null;
  timerStartedAt: Date | null;
  timerPausedAt: Date | null;
  elapsedBeforePauseMs: number;
}

export interface SportsProjectionAction {
  type: SportsMatchActionType;
  payload: unknown;
  authoredAt: Date;
  reviewStatus: SportsReviewStatus;
}

export function projectSportsMatch(
  actions: readonly SportsProjectionAction[],
  options: {
    approvedOnly: boolean;
    hasCheckedInPlayers: boolean;
    maximumPeriods: number | null;
    periodLabel: string | null;
  },
): SportsProjectedOutcome {
  let projection: SportsProjectedOutcome = {
    state: options.hasCheckedInPlayers
      ? SportsMatchState.CHECK_IN
      : SportsMatchState.SCHEDULED,
    scoreboard: normalizeSportsScoreboard(undefined),
    winnerRegistrationId: null,
    loserRegistrationId: null,
    lossReason: null,
    lossReasonDetail: null,
    drawWillReschedule: null,
    timerStartedAt: null,
    timerPausedAt: null,
    elapsedBeforePauseMs: 0,
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
  },
): SportsProjectedOutcome {
  const payload = requireRecord(action.payload);
  switch (action.type) {
    case SportsMatchActionType.CHECK_IN:
      return {
        ...current,
        state:
          current.state === SportsMatchState.SCHEDULED
            ? SportsMatchState.CHECK_IN
            : current.state,
      };
    case SportsMatchActionType.START:
      assertState(current.state, [SportsMatchState.SCHEDULED, SportsMatchState.CHECK_IN]);
      return {
        ...current,
        state: SportsMatchState.LIVE,
        timerStartedAt: action.authoredAt,
        timerPausedAt: null,
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
      };
    case SportsMatchActionType.RESUME:
      assertState(current.state, [SportsMatchState.PAUSED]);
      return {
        ...current,
        state: SportsMatchState.LIVE,
        timerStartedAt: action.authoredAt,
        timerPausedAt: null,
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
    case SportsMatchActionType.SCORE_CORRECTION:
      return {
        ...current,
        scoreboard: normalizeSportsScoreboard(payload['scoreboard']),
      };
    case SportsMatchActionType.PERIOD_ROLL:
      assertState(current.state, [SportsMatchState.LIVE, SportsMatchState.PAUSED]);
      return {
        ...current,
        scoreboard: rollSportsScorePeriod(current.scoreboard, {
          maximumPeriods: options.maximumPeriods,
          label:
            typeof payload['label'] === 'string'
              ? payload['label']
              : options.periodLabel ?? undefined,
        }),
      };
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
        payload['scoreboard'] === undefined
          ? current.scoreboard
          : normalizeSportsScoreboard(payload['scoreboard']);
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
        ...projectionReset(),
        state: SportsMatchState.SCHEDULED,
      };
    default:
      return current;
  }
}

function stopTimer(
  current: SportsProjectedOutcome,
  at: Date,
): SportsProjectedOutcome {
  return {
    ...current,
    elapsedBeforePauseMs:
      current.elapsedBeforePauseMs +
      (current.state === SportsMatchState.LIVE && current.timerStartedAt
        ? Math.max(0, at.getTime() - current.timerStartedAt.getTime())
        : 0),
    timerStartedAt: null,
    timerPausedAt:
      current.state === SportsMatchState.LIVE || current.state === SportsMatchState.PAUSED
        ? at
        : current.timerPausedAt,
  };
}

function projectionReset(): SportsProjectedOutcome {
  return {
    state: SportsMatchState.SCHEDULED,
    scoreboard: normalizeSportsScoreboard(undefined),
    winnerRegistrationId: null,
    loserRegistrationId: null,
    lossReason: null,
    lossReasonDetail: null,
    drawWillReschedule: null,
    timerStartedAt: null,
    timerPausedAt: null,
    elapsedBeforePauseMs: 0,
  };
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
  if (
    typeof value !== 'string' ||
    !Object.values(SportsLossReason).includes(value as SportsLossReason)
  ) {
    throw new TypeError('Loss reason is invalid.');
  }
  return value as SportsLossReason;
}
