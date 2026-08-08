import type { PublicSportsMatch } from '../read/sports-read.models';
import {
  DEFAULT_SPORTS_MATCH_OVERLAY_CONFIG,
  SportsMatchOverlayService,
} from './sports-match-overlay.service';

describe('SportsMatchOverlayService', () => {
  const sportsRead = {
    publicMatch: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createService(): SportsMatchOverlayService {
    return new SportsMatchOverlayService(sportsRead as never);
  }

  function createMatch(overrides: Partial<PublicSportsMatch> = {}): PublicSportsMatch {
    return {
      id: 'match-1',
      eventId: 'event-1',
      categoryId: 'category-1',
      stageId: 'stage-1',
      homeTeam: { id: 'team-home', name: 'Atlética Azul', institution: 'FCT', logoUrl: '/logos/home.png' },
      awayTeam: { id: 'team-away', name: 'Atlética Vermelha', institution: 'FCT', logoUrl: null },
      state: 'LIVE',
      scoreboard: {
        homeScore: 3,
        awayScore: 2,
        activePeriod: 2,
        periods: [
          { number: 1, label: '1º tempo', homeScore: 2, awayScore: 1, completed: true },
          { number: 2, label: '2º tempo', homeScore: 1, awayScore: 1, completed: false },
        ],
      },
      winner: null,
      loser: null,
      lossReason: null,
      lossReasonDetail: null,
      drawWillReschedule: null,
      timerStartedAt: null,
      timerStartedAtUnixMs: Date.now() - 65_000,
      timerPausedAt: null,
      timerPausedAtUnixMs: null,
      elapsedBeforePauseMs: 300_000,
      periodTimers: [],
      overallTimerEnabled: true,
      periodTimerEnabled: true,
      timerPeriodDurationMs: null,
      timerPeriodStartOffsetsMs: [],
      timerAllowOvertime: true,
      roundNumber: 1,
      bracketPosition: 1,
      groupKey: null,
      schedule: {
        startDate: new Date(),
        endDate: new Date(),
        locationDescription: null,
        latitude: null,
        longitude: null,
        venueName: null,
        courtLabel: null,
      },
      rosters: [],
      officials: [],
      livestreamProvider: null,
      livestreamUrl: null,
      ...overrides,
    };
  }

  it('uses a stable match route and validates presentation query parameters', () => {
    const config = createService().parseConfig({
      team: 'away',
      teamName: '0',
      teamIcon: 'false',
      score: '1',
      stopwatch: 'off',
      period: 'yes',
      state: '0',
      periodWord: '  período  ',
    });

    expect(config).toEqual({
      team: 'away',
      showTeamName: false,
      showTeamIcon: false,
      showScore: true,
      showStopwatch: false,
      showPeriod: true,
      showState: false,
      periodWord: 'Período',
    });
    expect(createService().parseConfig({})).toEqual(DEFAULT_SPORTS_MATCH_OVERLAY_CONFIG);
    expect(createService().parseConfig({ periodWord: '<script>alert(1)</script>' }).periodWord).toBe('Rodada');
  });

  it('renders a CSP-compatible transparent document and escapes match-controlled text', () => {
    const service = createService();
    const html = service.renderDocument(
      createMatch({
        homeTeam: {
          id: 'team-home',
          name: '<img src=x onerror=alert(1)>',
          institution: null,
          logoUrl: '/api/sports/public/teams/team-home/logo/sha256',
        },
      }),
      service.parseConfig({ periodWord: '<script>alert(1)</script>' }),
    );

    expect(html).toContain('data-team="both"');
    expect(html).toContain('href="/api/sports/public/overlays/sports-match.css"');
    expect(html).toContain('src="/api/sports/public/overlays/sports-match.js"');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('data-period-word="Rodada"');
    expect(html).not.toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(service.stylesheet()).toContain('background: transparent');
    expect(service.stylesheet()).toContain("'Inter Variable'");
  });

  it('returns only the score data needed by the overlay runtime', async () => {
    const match = createMatch();
    sportsRead.publicMatch.mockResolvedValue(match);

    const result = await createService().data('match-1');

    expect(result).toEqual({
      id: 'match-1',
      homeTeam: { name: 'Atlética Azul', logoUrl: '/logos/home.png' },
      awayTeam: { name: 'Atlética Vermelha', logoUrl: null },
      state: 'LIVE',
      scoreboard: match.scoreboard,
      timerStartedAtUnixMs: match.timerStartedAtUnixMs,
      elapsedBeforePauseMs: 300_000,
      periodTimers: [],
      overallTimerEnabled: true,
    });
    expect(result).not.toHaveProperty('rosters');
    expect(sportsRead.publicMatch).toHaveBeenCalledWith('match-1');
  });
});
