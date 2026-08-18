import { SportsMatchState } from '@prisma/client';
import { normalizeSportsScoreboard } from '../domain/sports-scoreboard';
import { SportsProjectedOutcome } from './sports-match-projection.models';

export function createSportsProjectionReset(): SportsProjectedOutcome {
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
    periodTimers: [],
    overallTimerEnabled: true,
    periodTimerEnabled: true,
    timerPeriodDurationMs: null,
    timerPeriodStartOffsetsMs: [],
    timerAllowOvertime: true,
  };
}
