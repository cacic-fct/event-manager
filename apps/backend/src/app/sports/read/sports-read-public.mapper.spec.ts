import { SportsMatchState } from '@prisma/client';
import { sportsPublicMatchRecord, sportsPublicTeamRecord, sportsTestDate } from '../testing/sports-backend.fixtures';
import { SportsReadPublicMapper } from './sports-read-public.mapper';

describe('SportsReadPublicMapper', () => {
  const mapper = new SportsReadPublicMapper();

  it('maps public teams with a content-addressed logo URL', () => {
    expect(
      mapper.mapPublicTeam(sportsPublicTeamRecord({ id: 'team-1', name: 'Azul', logoSha256: 'abc' }) as never),
    ).toEqual({
      id: 'team-1',
      name: 'Azul',
      institution: 'FCT',
      logoUrl: '/api/sports/public/teams/team-1/logo/abc',
    });
    expect(
      mapper.mapPublicTeam(
        sportsPublicTeamRecord({ id: 'team-2', name: 'Verde', institution: null, logoSha256: null }) as never,
      ).logoUrl,
    ).toBeNull();
  });

  it('maps normalized period scores to the public scoreboard contract', () => {
    expect(
      mapper.mapPublicScoreboard({
        home: 3,
        away: 2,
        activePeriodNumber: 2,
        periods: [{ number: 1, label: '1º tempo', home: 1, away: 1, closed: true }],
      }),
    ).toEqual({
      homeScore: 3,
      awayScore: 2,
      activePeriod: 2,
      periods: [{ number: 1, label: '1º tempo', homeScore: 1, awayScore: 1, completed: true }],
    });
  });

  it.each([
    [SportsMatchState.SCHEDULED, false],
    [SportsMatchState.IN_PROGRESS, false],
    [SportsMatchState.FINISHED, true],
    [SportsMatchState.DRAW, true],
    [undefined, false],
  ])('reveals rosters only after a canonical final state', (state, expected) => {
    expect(mapper.canRevealRoster(state)).toBe(expected);
  });

  it('maps the full privacy-safe match projection including winner, timers, venue, rosters, and officials', () => {
    const startedAt = sportsTestDate(-10 * 60_000);
    const pausedAt = sportsTestDate(-5 * 60_000);
    const match = sportsPublicMatchRecord();
    const projection = {
      state: SportsMatchState.FINISHED,
      scoreboard: { home: 3, away: 2, activePeriodNumber: 2, periods: [] },
      winnerRegistrationId: 'registration-home',
      loserRegistrationId: 'registration-away',
      lossReason: 'SCORE',
      lossReasonDetail: null,
      drawWillReschedule: false,
      timerStartedAt: startedAt,
      timerPausedAt: pausedAt,
      elapsedBeforePauseMs: 300_000,
      periodTimers: [],
      overallTimerEnabled: true,
      periodTimerEnabled: false,
      timerPeriodDurationMs: null,
      timerPeriodStartOffsetsMs: [],
      timerAllowOvertime: true,
    };
    const rosters = [{ team: { id: 'team-home' }, entries: [] }];
    const officials = [{ name: 'Carlos S.', role: 'REFEREE' }];

    expect(mapper.mapPublicMatch(match as never, projection as never, rosters as never, officials as never)).toEqual(
      expect.objectContaining({
        id: 'match-1',
        homeTeam: expect.objectContaining({ id: 'team-home' }),
        awayTeam: expect.objectContaining({ id: 'team-away' }),
        winner: expect.objectContaining({ id: 'team-home' }),
        loser: expect.objectContaining({ id: 'team-away' }),
        timerStartedAt: startedAt,
        timerStartedAtUnixMs: startedAt.getTime(),
        timerPausedAt: pausedAt,
        timerPausedAtUnixMs: pausedAt.getTime(),
        schedule: expect.objectContaining({ venueName: 'Ginásio', courtLabel: 'Quadra 1' }),
        rosters,
        officials,
      }),
    );
  });

  it('maps absent teams, results, timers, and venues to null', () => {
    const match = sportsPublicMatchRecord({
      homeRegistrationId: null,
      homeRegistration: null,
      awayRegistrationId: null,
      awayRegistration: null,
      venue: null,
    });
    const projection = {
      state: SportsMatchState.SCHEDULED,
      scoreboard: { home: 0, away: 0, activePeriodNumber: null, periods: [] },
      winnerRegistrationId: null,
      loserRegistrationId: null,
      timerStartedAt: null,
      timerPausedAt: null,
    };

    expect(mapper.mapPublicMatch(match as never, projection as never, [], [])).toEqual(
      expect.objectContaining({
        homeTeam: null,
        awayTeam: null,
        winner: null,
        loser: null,
        timerStartedAtUnixMs: null,
        timerPausedAtUnixMs: null,
        schedule: expect.objectContaining({ venueName: null, courtLabel: null }),
      }),
    );
  });

  it('projects stored actions using category timer and roster context', () => {
    const projected = mapper.projectPublicMatch(
      sportsPublicMatchRecord({ rosters: [{ entries: [{ id: 'entry-1' }] }] }) as never,
    );

    expect(projected.state).toBe(SportsMatchState.CHECK_IN);
    expect(projected.scoreboard).toEqual(expect.objectContaining({ home: 0, away: 0 }));
  });
});
