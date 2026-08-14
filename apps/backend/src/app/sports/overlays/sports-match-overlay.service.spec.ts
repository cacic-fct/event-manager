import type { PublicSportsMatch } from '../read/sports-read.models';
import {
  DEFAULT_SPORTS_MATCH_OVERLAY_CONFIG,
  DEMO_SPORTS_MATCH_OVERLAY_DATA,
  SPORTS_MATCH_OVERLAY_DEMO_ID,
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
    expect(html).toContain('<style id="sports-match-overlay-stylesheet">');
    expect(html).toContain('<script id="sports-match-overlay-runtime" defer>');
    expect(html).toContain('id="sports-match-overlay"');
    expect(html).not.toContain('sports-match.css');
    expect(html).not.toContain('sports-match.js');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('data-period-word="Rodada"');
    expect(html).not.toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(service.stylesheet()).toContain('background: transparent');
    expect(service.stylesheet()).toContain("'Inter Variable'");
    expect(service.stylesheet()).toContain('.sports-overlay__team--away');
    expect(service.stylesheet()).toContain('overflow-wrap: anywhere');
    expect(service.stylesheet()).not.toContain('overflow: hidden');
    expect(service.stylesheet()).not.toContain('white-space: nowrap');
    expect(service.stylesheet()).not.toContain('text-overflow: ellipsis');
    expect(service.contentSecurityPolicy('match-1')).toContain("script-src 'self' 'sha256-");
    expect(service.contentSecurityPolicy('match-1')).toContain("style-src 'self' 'sha256-");
    expect(service.contentSecurityPolicy('match-1')).toContain("img-src 'self' data:");
    expect(service.contentSecurityPolicy('match-1')).not.toContain('eventos.cacic.com.br');
    expect(service.contentSecurityPolicy(SPORTS_MATCH_OVERLAY_DEMO_ID)).toContain(
      "img-src 'self' data: https://eventos.cacic.com.br",
    );
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

  it('serves generic hardcoded data for the demo match without reading the database', async () => {
    const service = createService();
    const before = Date.now();
    const result = await service.data(SPORTS_MATCH_OVERLAY_DEMO_ID);
    const after = Date.now();

    expect(result).not.toBe(DEMO_SPORTS_MATCH_OVERLAY_DATA);
    expect(result.homeTeam?.name).toBe('Equipe A');
    expect(result.awayTeam?.name).toBe('Equipe B com nome longo');
    expect(result.awayTeam?.logoUrl).toBe('https://eventos.cacic.com.br/app/icons/favicon.svg');
    expect(result.scoreboard).toMatchObject({ homeScore: 1, awayScore: 99 });
    expect(result.elapsedBeforePauseMs).toBe(0);
    expect(result.timerStartedAtUnixMs).toBeGreaterThanOrEqual(before - 90_000 - 10);
    expect(result.timerStartedAtUnixMs).toBeLessThanOrEqual(after - 90_000);
    const laterResult = await service.data(SPORTS_MATCH_OVERLAY_DEMO_ID);
    expect(laterResult.timerStartedAtUnixMs).toBeGreaterThanOrEqual(result.timerStartedAtUnixMs ?? 0);
    expect(sportsRead.publicMatch).not.toHaveBeenCalled();
  });

  it('renders the demo match through the same overlay URL contract', async () => {
    const html = await createService().render(SPORTS_MATCH_OVERLAY_DEMO_ID, {});

    expect(html).toContain('data-match-id="demo"');
    expect(html).toContain('Equipe A');
    expect(html).toContain('Equipe B com nome longo');
    expect(html).toContain('src="https://eventos.cacic.com.br/app/icons/favicon.svg"');
    expect(html).toContain('/api/sports/public/matches/demo/overlay/data');
    expect(html).toContain('/api/sports/matches/demo/events');
    expect(html).toContain('id="sports-match-overlay-away-score"');
    expect(html).toContain('>99</strong>');
    expect(html).toContain('id="sports-match-overlay-away-name"');
    expect(html).toContain('id="sports-match-overlay-away-icon"');
    expect(html.indexOf('id="sports-match-overlay-away-score"')).toBeLessThan(
      html.indexOf('id="sports-match-overlay-away-name"'),
    );
    expect(html.indexOf('id="sports-match-overlay-away-name"')).toBeLessThan(
      html.indexOf('id="sports-match-overlay-away-icon"'),
    );
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([
      'sports-match-overlay-document',
      'sports-match-overlay-head',
      'sports-match-overlay-charset',
      'sports-match-overlay-viewport',
      'sports-match-overlay-title',
      'sports-match-overlay-stylesheet',
      'sports-match-overlay-body',
      'sports-match-overlay',
      'sports-match-overlay-home-team',
      'sports-match-overlay-home-icon',
      'sports-match-overlay-home-logo',
      'sports-match-overlay-home-icon-placeholder',
      'sports-match-overlay-home-name',
      'sports-match-overlay-home-score',
      'sports-match-overlay-center',
      'sports-match-overlay-state',
      'sports-match-overlay-stopwatch',
      'sports-match-overlay-period',
      'sports-match-overlay-away-team',
      'sports-match-overlay-away-score',
      'sports-match-overlay-away-name',
      'sports-match-overlay-away-icon',
      'sports-match-overlay-away-logo',
      'sports-match-overlay-away-icon-placeholder',
      'sports-match-overlay-runtime',
    ]));
    expect(sportsRead.publicMatch).not.toHaveBeenCalled();
  });
});
