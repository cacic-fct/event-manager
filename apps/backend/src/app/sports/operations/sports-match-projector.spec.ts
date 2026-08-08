import {
  SportsLossReason,
  SportsMatchActionType,
  SportsMatchState,
  SportsReviewStatus,
} from '@prisma/client';
import {
  SPORTS_TEST_NOW,
  sportsProjectionAction,
} from '../testing/sports-backend.fixtures';
import { projectSportsMatch } from './sports-match-projector';

describe('projectSportsMatch', () => {
  const options = {
    approvedOnly: false,
    hasCheckedInPlayers: false,
    maximumPeriods: 4,
    periodLabel: 'Período',
  };

  it('projects pending official intent publicly while preserving the approved canonical state', () => {
    const actions = [
      sportsProjectionAction(),
      sportsProjectionAction({
        type: SportsMatchActionType.SCORE_DELTA,
        payload: { side: 'HOME', amount: 2 },
        authoredAt: new Date('2026-07-29T12:01:00.000Z'),
        reviewStatus: SportsReviewStatus.PENDING,
      }),
    ];

    expect(projectSportsMatch(actions, options)).toMatchObject({
      state: SportsMatchState.LIVE,
      scoreboard: { home: 2, away: 0 },
    });
    expect(
      projectSportsMatch(actions, { ...options, approvedOnly: true }),
    ).toMatchObject({
      state: SportsMatchState.LIVE,
      scoreboard: { home: 0, away: 0 },
    });
  });

  it('ignores rejected actions and safely skips dependent offline actions', () => {
    const actions = [
      sportsProjectionAction({
        reviewStatus: SportsReviewStatus.REJECTED,
      }),
      sportsProjectionAction({
        type: SportsMatchActionType.SCORE_DELTA,
        payload: { side: 'HOME', amount: 1 },
        authoredAt: new Date('2026-07-29T12:01:00.000Z'),
        reviewStatus: SportsReviewStatus.PENDING,
      }),
    ];

    expect(projectSportsMatch(actions, options)).toMatchObject({
      state: SportsMatchState.SCHEDULED,
      scoreboard: { home: 0, away: 0 },
    });
  });

  it('uses authored timestamps for an offline-safe, deterministic stopwatch projection', () => {
    const actions = [
      sportsProjectionAction({
        authoredAt: new Date('2026-07-29T10:00:00.000Z'),
      }),
      sportsProjectionAction({
        type: SportsMatchActionType.PAUSE,
        authoredAt: new Date('2026-07-29T10:12:00.000Z'),
      }),
      sportsProjectionAction({
        type: SportsMatchActionType.RESUME,
        authoredAt: new Date('2026-07-29T10:20:00.000Z'),
      }),
      sportsProjectionAction({
        type: SportsMatchActionType.FINALIZE,
        payload: {
          draw: false,
          winnerRegistrationId: 'registration-home',
          loserRegistrationId: 'registration-away',
          lossReason: SportsLossReason.SCORE,
        },
        authoredAt: new Date('2026-07-29T10:28:30.000Z'),
      }),
    ];

    expect(projectSportsMatch(actions, options)).toMatchObject({
      state: SportsMatchState.FINISHED,
      elapsedBeforePauseMs: 20.5 * 60_000,
      timerStartedAt: null,
      timerPausedAt: new Date('2026-07-29T10:28:30.000Z'),
    });
  });

  it('resets every derived outcome after an administrator reschedules a terminal match', () => {
    const actions = [
      sportsProjectionAction(),
      sportsProjectionAction({
        type: SportsMatchActionType.SCORE_DELTA,
        payload: { side: 'HOME', amount: 3 },
      }),
      sportsProjectionAction({
        type: SportsMatchActionType.FINALIZE,
        payload: {
          draw: false,
          winnerRegistrationId: 'registration-home',
          loserRegistrationId: 'registration-away',
          lossReason: SportsLossReason.SCORE,
        },
      }),
      sportsProjectionAction({
        type: SportsMatchActionType.RESCHEDULE,
        authoredAt: new Date(SPORTS_TEST_NOW.getTime() + 60_000),
      }),
    ];

    expect(projectSportsMatch(actions, options)).toEqual({
      state: SportsMatchState.SCHEDULED,
      scoreboard: {
        home: 0,
        away: 0,
        periods: [],
        activePeriodNumber: null,
      },
      winnerRegistrationId: null,
      loserRegistrationId: null,
      lossReason: null,
      lossReasonDetail: null,
      drawWillReschedule: null,
      timerStartedAt: null,
      timerPausedAt: null,
      elapsedBeforePauseMs: 0,
    });
  });

  it('starts in check-in when attendance already exists without requiring a synthetic action', () => {
    expect(
      projectSportsMatch([], {
        ...options,
        hasCheckedInPlayers: true,
      }),
    ).toMatchObject({
      state: SportsMatchState.CHECK_IN,
    });
  });
});
