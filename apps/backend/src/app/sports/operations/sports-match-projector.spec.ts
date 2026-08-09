import { SportsMatchActionType, SportsMatchState, SportsReviewStatus } from '@prisma/client';
import { projectSportsMatch } from './sports-match-projector';

describe('sports match occurrence projection', () => {
  it('keeps generic occurrences replayable without changing score or match state', () => {
    const authoredAt = new Date('2026-08-01T14:00:00.000Z');
    const projection = projectSportsMatch(
      [
        {
          type: SportsMatchActionType.START,
          payload: {},
          authoredAt,
          reviewStatus: SportsReviewStatus.APPROVED,
        },
        {
          type: SportsMatchActionType.OCCURRENCE,
          payload: {
            occurrenceId: 'occurrence-1',
            kind: 'ADVERTENCIA',
            note: 'Observação operacional',
          },
          authoredAt,
          reviewStatus: SportsReviewStatus.PENDING,
        },
      ],
      {
        approvedOnly: false,
        hasCheckedInPlayers: true,
        maximumPeriods: null,
        periodLabel: null,
      },
    );

    expect(projection.state).toBe(SportsMatchState.LIVE);
    expect(projection.scoreboard).toMatchObject({ home: 0, away: 0 });
  });

  it('uses the scheduled period baseline while preserving actual per-period elapsed time', () => {
    const start = new Date('2026-08-01T14:00:00.000Z');
    const secondHalf = new Date(start.getTime() + 47 * 60_000);
    const projection = projectSportsMatch(
      [
        {
          type: SportsMatchActionType.START,
          payload: {},
          authoredAt: start,
          reviewStatus: SportsReviewStatus.APPROVED,
        },
        {
          type: SportsMatchActionType.PERIOD_ROLL,
          payload: {},
          authoredAt: secondHalf,
          reviewStatus: SportsReviewStatus.PENDING,
        },
      ],
      {
        approvedOnly: false,
        hasCheckedInPlayers: true,
        maximumPeriods: 2,
        periodLabel: 'Tempo',
        timerRules: {
          periodDurationMs: 45 * 60_000,
          periodStartOffsetsMs: [0, 45 * 60_000],
          allowOvertime: true,
        },
      },
    );

    expect(projection.elapsedBeforePauseMs).toBe(45 * 60_000);
    expect(projection.periodTimers).toEqual([
      expect.objectContaining({ periodNumber: 1, elapsedBeforePauseMs: 47 * 60_000, capMs: 45 * 60_000 }),
      expect.objectContaining({
        periodNumber: 2,
        scheduledStartOffsetMs: 45 * 60_000,
        startedAtUnixMs: secondHalf.getTime(),
      }),
    ]);
  });

  it('keeps the overall and new period timers paused when rolling from a paused match', () => {
    const start = new Date('2026-08-01T14:00:00.000Z');
    const pause = new Date(start.getTime() + 10 * 60_000);
    const roll = new Date(start.getTime() + 15 * 60_000);
    const projection = projectSportsMatch(
      [
        {
          type: SportsMatchActionType.START,
          payload: {},
          authoredAt: start,
          reviewStatus: SportsReviewStatus.APPROVED,
        },
        {
          type: SportsMatchActionType.PAUSE,
          payload: {},
          authoredAt: pause,
          reviewStatus: SportsReviewStatus.APPROVED,
        },
        {
          type: SportsMatchActionType.PERIOD_ROLL,
          payload: {},
          authoredAt: roll,
          reviewStatus: SportsReviewStatus.PENDING,
        },
      ],
      {
        approvedOnly: false,
        hasCheckedInPlayers: true,
        maximumPeriods: 2,
        periodLabel: 'Tempo',
        timerRules: {
          periodDurationMs: 45 * 60_000,
          periodStartOffsetsMs: [0, 45 * 60_000],
        },
      },
    );

    expect(projection.state).toBe(SportsMatchState.PAUSED);
    expect(projection.timerStartedAt).toBeNull();
    expect(projection.timerPausedAt?.getTime()).toBe(pause.getTime());
    expect(projection.elapsedBeforePauseMs).toBe(45 * 60_000);
    expect(projection.periodTimers).toEqual([
      expect.objectContaining({
        periodNumber: 1,
        startedAtUnixMs: null,
        pausedAtUnixMs: pause.getTime(),
        elapsedBeforePauseMs: 10 * 60_000,
      }),
      expect.objectContaining({
        periodNumber: 2,
        startedAtUnixMs: null,
        pausedAtUnixMs: roll.getTime(),
        elapsedBeforePauseMs: 0,
      }),
    ]);
  });

  it('restores the stopwatch when a score correction undoes a newly created period', () => {
    const start = new Date('2026-08-01T14:00:00.000Z');
    const secondPeriod = new Date('2026-08-01T14:47:00.000Z');
    const undo = new Date('2026-08-01T14:48:00.000Z');
    const projection = projectSportsMatch(
      [
        {
          type: SportsMatchActionType.START,
          payload: {},
          authoredAt: start,
          reviewStatus: SportsReviewStatus.APPROVED,
        },
        {
          type: SportsMatchActionType.PERIOD_ROLL,
          payload: {},
          authoredAt: secondPeriod,
          reviewStatus: SportsReviewStatus.PENDING,
        },
        {
          type: SportsMatchActionType.SCORE_CORRECTION,
          payload: {
            scoreboard: {
              home: 0,
              away: 0,
              activePeriodNumber: 1,
              periods: [{ number: 1, label: 'Tempo', home: 0, away: 0, closed: false }],
            },
            stopwatch: {
              state: 'LIVE',
              overall: {
                startedAtUnixMs: start.getTime(),
                pausedAtUnixMs: null,
                elapsedBeforePauseMs: 0,
              },
              periods: [
                {
                  periodNumber: 1,
                  startedAtUnixMs: start.getTime(),
                  pausedAtUnixMs: null,
                  elapsedBeforePauseMs: 0,
                  scheduledStartOffsetMs: 0,
                  capMs: 45 * 60_000,
                  allowOvertime: true,
                },
              ],
              activePeriod: 1,
            },
          },
          authoredAt: undo,
          reviewStatus: SportsReviewStatus.PENDING,
        },
      ],
      {
        approvedOnly: false,
        hasCheckedInPlayers: true,
        maximumPeriods: 2,
        periodLabel: 'Tempo',
        periodsEnabled: true,
        timerRules: {
          periodDurationMs: 45 * 60_000,
          periodStartOffsetsMs: [0, 45 * 60_000],
          allowOvertime: true,
        },
      },
    );

    expect(projection.state).toBe(SportsMatchState.LIVE);
    expect(projection.scoreboard.activePeriodNumber).toBe(1);
    expect(projection.scoreboard.periods).toHaveLength(1);
    expect(projection.timerStartedAt?.getTime()).toBe(start.getTime());
    expect(projection.timerPausedAt).toBeNull();
    expect(projection.elapsedBeforePauseMs).toBe(0);
    expect(projection.periodTimers).toEqual([
      expect.objectContaining({ periodNumber: 1, startedAtUnixMs: start.getTime(), elapsedBeforePauseMs: 0 }),
    ]);
  });

  it('replays an explicit device timer reconciliation using safe Unix milliseconds', () => {
    const projection = projectSportsMatch(
      [
        {
          type: SportsMatchActionType.TIMER_RECONCILE,
          authoredAt: new Date('2026-08-01T14:10:00.000Z'),
          reviewStatus: SportsReviewStatus.PENDING,
          payload: {
            resolution: 'DEVICE',
            overall: { startedAtUnixMs: 1_786_000_000_000, pausedAtUnixMs: null, elapsedBeforePauseMs: 120_000 },
            periods: [
              {
                periodNumber: 1,
                startedAtUnixMs: 1_786_000_000_000,
                pausedAtUnixMs: null,
                elapsedBeforePauseMs: 120_000,
                scheduledStartOffsetMs: 0,
                capMs: 2_700_000,
                allowOvertime: true,
              },
            ],
          },
        },
      ],
      { approvedOnly: false, hasCheckedInPlayers: true, maximumPeriods: 2, periodLabel: 'Tempo' },
    );
    expect(projection.timerStartedAt?.getTime()).toBe(1_786_000_000_000);
    expect(projection.periodTimers[0]?.elapsedBeforePauseMs).toBe(120_000);
  });

  it('advances the overall scheduled baseline when per-period clocks are hidden', () => {
    const start = new Date('2026-08-01T14:00:00.000Z');
    const secondHalf = new Date(start.getTime() + 46 * 60_000);
    const projection = projectSportsMatch(
      [
        {
          type: SportsMatchActionType.START,
          payload: {},
          authoredAt: start,
          reviewStatus: SportsReviewStatus.APPROVED,
        },
        {
          type: SportsMatchActionType.PERIOD_ROLL,
          payload: {},
          authoredAt: secondHalf,
          reviewStatus: SportsReviewStatus.PENDING,
        },
      ],
      {
        approvedOnly: false,
        hasCheckedInPlayers: true,
        periodsEnabled: true,
        maximumPeriods: 2,
        periodLabel: 'Tempo',
        timerRules: {
          overallEnabled: true,
          periodEnabled: false,
          periodDurationMs: 45 * 60_000,
          periodStartOffsetsMs: [0, 45 * 60_000],
        },
      },
    );

    expect(projection.scoreboard.activePeriodNumber).toBe(2);
    expect(projection.elapsedBeforePauseMs).toBe(45 * 60_000);
    expect(projection.overallTimerEnabled).toBe(true);
    expect(projection.periodTimerEnabled).toBe(false);
    expect(projection.periodTimers).toEqual([]);
  });

  it('reconciles a device period advance without losing overlapping server scores', () => {
    const start = new Date('2026-08-01T14:00:00.000Z');
    const projection = projectSportsMatch(
      [
        {
          type: SportsMatchActionType.START,
          payload: {},
          authoredAt: start,
          reviewStatus: SportsReviewStatus.APPROVED,
        },
        {
          type: SportsMatchActionType.SCORE_DELTA,
          payload: { side: 'HOME', amount: 2, periodNumber: 1 },
          authoredAt: new Date(start.getTime() + 10_000),
          reviewStatus: SportsReviewStatus.APPROVED,
        },
        {
          type: SportsMatchActionType.TIMER_RECONCILE,
          authoredAt: new Date(start.getTime() + 46 * 60_000),
          reviewStatus: SportsReviewStatus.PENDING,
          payload: {
            resolution: 'DEVICE',
            activePeriodNumber: 2,
            overall: {
              startedAtUnixMs: start.getTime() + 46 * 60_000,
              pausedAtUnixMs: null,
              elapsedBeforePauseMs: 45 * 60_000,
            },
            periods: [
              {
                periodNumber: 1,
                startedAtUnixMs: null,
                pausedAtUnixMs: start.getTime() + 46 * 60_000,
                elapsedBeforePauseMs: 46 * 60_000,
                scheduledStartOffsetMs: 0,
                capMs: 45 * 60_000,
                allowOvertime: true,
              },
              {
                periodNumber: 2,
                startedAtUnixMs: start.getTime() + 46 * 60_000,
                pausedAtUnixMs: null,
                elapsedBeforePauseMs: 0,
                scheduledStartOffsetMs: 45 * 60_000,
                capMs: 45 * 60_000,
                allowOvertime: true,
              },
            ],
          },
        },
      ],
      {
        approvedOnly: false,
        hasCheckedInPlayers: true,
        periodsEnabled: true,
        maximumPeriods: 2,
        periodLabel: 'Tempo',
      },
    );

    expect(projection.scoreboard.activePeriodNumber).toBe(2);
    expect(projection.scoreboard.home).toBe(2);
    expect(projection.scoreboard.periods).toEqual([
      expect.objectContaining({ number: 1, home: 2, closed: true }),
      expect.objectContaining({ number: 2, home: 0, closed: false }),
    ]);
  });

  it('exposes arbitrary validated offsets for deterministic offline period rolls', () => {
    const projection = projectSportsMatch([], {
      approvedOnly: false,
      hasCheckedInPlayers: false,
      periodsEnabled: true,
      maximumPeriods: 3,
      periodLabel: 'Período',
      timerRules: {
        periodDurationMs: 45 * 60_000,
        periodStartOffsetsMs: [0, 45 * 60_000, 100 * 60_000],
        allowOvertime: false,
      },
    });

    expect(projection.timerPeriodDurationMs).toBe(45 * 60_000);
    expect(projection.timerPeriodStartOffsetsMs).toEqual([0, 45 * 60_000, 100 * 60_000]);
    expect(projection.timerAllowOvertime).toBe(false);
  });
});
