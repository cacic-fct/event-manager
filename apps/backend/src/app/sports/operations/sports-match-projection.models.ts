import { SportsLossReason, SportsMatchActionType, SportsMatchState, SportsReviewStatus } from '@prisma/client';
import { SportsScoreboard } from '../domain/sports-scoreboard';

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
  periodTimers: SportsProjectedPeriodTimer[];
  overallTimerEnabled: boolean;
  periodTimerEnabled: boolean;
  timerPeriodDurationMs: number | null;
  timerPeriodStartOffsetsMs: number[];
  timerAllowOvertime: boolean;
}

export interface SportsProjectedPeriodTimer {
  periodNumber: number;
  startedAtUnixMs: number | null;
  pausedAtUnixMs: number | null;
  elapsedBeforePauseMs: number;
  scheduledStartOffsetMs: number;
  capMs: number | null;
  allowOvertime: boolean;
}

export interface SportsProjectionAction {
  type: SportsMatchActionType;
  payload: unknown;
  authoredAt: Date;
  reviewStatus: SportsReviewStatus;
}
