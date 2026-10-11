import { Location } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { SportsMatchPage } from './match-page';
import { SportsViewerApiService } from './sports-viewer-api.service';
import { createSportsViewerMatch, createSportsViewerRoster } from './sports-viewer.fixtures';
import { SportsViewerRealtimeService } from './sports-viewer-realtime.service';

describe('SportsMatchPage', () => {
  const paramMap = new BehaviorSubject(convertToParamMap({ matchId: 'match-fixture' }));
  let realtime: Subject<void>;
  const back = vi.fn();
  const getMatch = vi.fn(() => of(createSportsViewerMatch({ id: 'match-fixture' })));
  const watchMatch = vi.fn(() => realtime);

  beforeEach(() => {
    realtime = new Subject<void>();
    paramMap.next(convertToParamMap({ matchId: 'match-fixture' }));
    getMatch.mockReset();
    getMatch.mockReturnValue(of(createSportsViewerMatch({ id: 'match-fixture' })));
    back.mockReset();
    watchMatch.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap, snapshot: { queryParamMap: convertToParamMap({}) } } },
        { provide: Location, useValue: { back } },
        { provide: SportsViewerApiService, useValue: { getMatch } },
        { provide: SportsViewerRealtimeService, useValue: { watchMatch } },
      ],
    });
  });

  it('loads only the canonical match route parameter', () => {
    paramMap.next(convertToParamMap({ id: 'match-fixture' }));
    TestBed.runInInjectionContext(() => new SportsMatchPage());
    expect(getMatch).not.toHaveBeenCalled();

    paramMap.next(convertToParamMap({ matchId: 'match-fixture' }));
    expect(getMatch).toHaveBeenCalledWith('match-fixture');
  });

  it('does not open a browser-only realtime stream during server rendering', () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });

    TestBed.runInInjectionContext(() => new SportsMatchPage());

    expect(watchMatch).not.toHaveBeenCalled();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('loads route changes, refreshes from realtime, and exposes display helpers', () => {
    const page = TestBed.runInInjectionContext(() => new SportsMatchPage());
    const match = createSportsViewerMatch({ id: 'match-fixture' });

    expect(page.pageState()).toEqual(expect.objectContaining({ status: 'ready' }));
    expect(page.stateLabel(match)).toBe('Ao vivo');
    expect(page.isLive(match)).toBe(true);
    expect(page.teamName(match, 'home')).toBe('Atlética FCT');
    expect(page.locationLabel(match)).toContain('Ginásio da FCT');
    expect(page.matchHasStarted(match)).toBe(true);
    expect(page.playerName('Ana Beatriz de Souza')).toBe('Ana Souza');
    expect(page.officialName('Mariana Clara dos Santos')).toBe('Mariana S.');
    expect(page.officialRoleLabel('REFEREE')).toBe('Arbitragem');
    expect(page.rosterRoleLabel('CAPTAIN')).toBe('Capitão');
    expect(page.lossReasonLabel('SCORE')).toBe('Placar');
    expect(page.hasLivestream(match)).toBe(true);

    realtime.next();
    expect(getMatch).toHaveBeenCalledTimes(2);
    paramMap.next(convertToParamMap({ matchId: 'match-next' }));
    expect(getMatch).toHaveBeenLastCalledWith('match-next');
    page.goBack();
    expect(back).toHaveBeenCalledOnce();
  });

  it('renders a single page heading and an atomic live-score announcement', () => {
    const fixture = TestBed.createComponent(SportsMatchPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelectorAll('h1')).toHaveLength(1);
    expect(element.querySelectorAll('.scoreboard .team h2')).toHaveLength(2);
    expect(element.querySelector('[aria-live="polite"][aria-atomic="true"]')?.textContent).toContain('Placar:');
    expect(element.querySelector('iframe')?.getAttribute('src')).toContain('youtube-nocookie.com/embed/storybook-sports');
    expect(element.querySelector('.livestream-section a')?.getAttribute('href')).toBe(
      'https://www.youtube.com/watch?v=storybook-sports',
    );

    fixture.destroy();
  });

  it('renders a scheduled match privately, then reveals organization and lineups when it starts', () => {
    getMatch
      .mockReturnValueOnce(
        of(
          createSportsViewerMatch({
            state: 'SCHEDULED',
            scoreboard: { homeScore: 0, awayScore: 0, activePeriod: null, periods: [] },
            timerStartedAt: null,
            periodTimers: [],
            rosters: createSportsViewerRoster(),
          }),
        ),
      )
      .mockReturnValueOnce(of(createSportsViewerMatch({ state: 'LIVE', rosters: createSportsViewerRoster() })));
    const fixture = TestBed.createComponent(SportsMatchPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('mat-chip')?.textContent).toContain('Agendada');
    expect(element.querySelector('.score-hero.live')).toBeNull();
    expect(element.querySelector('.public-clock')).toBeNull();
    expect(element.textContent).toContain('Ginásio da FCT');
    expect(element.querySelector('.officials-section')).toBeNull();
    expect(element.querySelector('.roster-section')).toBeNull();
    expect(element.textContent).not.toContain('Ana Souza');

    realtime.next();
    fixture.detectChanges();

    expect(element.querySelector('.officials-section h2')?.textContent).toContain('Organização da partida');
    expect(element.querySelector('.roster-section h2')?.textContent).toContain('Escalações');
    expect(element.textContent).toContain('Ana Souza');

    fixture.destroy();
  });

  it.each(['LIVE', 'PAUSED', 'FINISHED', 'DRAW'] as const)(
    'shows organization and lineups after a match reaches %s',
    (state) => {
      getMatch.mockReturnValue(
        of(createSportsViewerMatch({ id: 'match-fixture', state, rosters: createSportsViewerRoster() })),
      );
      const fixture = TestBed.createComponent(SportsMatchPage);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(element.querySelector('.officials-section h2')?.textContent).toContain('Organização da partida');
      expect(element.querySelector('.roster-section h2')?.textContent).toContain('Escalações');
      expect(element.textContent).toContain('Ana Souza');
      expect(element.textContent).toContain('Mariana S.');

      fixture.destroy();
    },
  );

  it('calculates capped and overtime clocks from fixture-relative timestamps', () => {
    const page = TestBed.runInInjectionContext(() => new SportsMatchPage());
    page.now.set(10_000);
    const match = createSportsViewerMatch({
      timerStartedAt: null,
      timerStartedAtUnixMs: 4_000,
      elapsedBeforePauseMs: 2_000,
      periodTimers: [
        {
          periodNumber: 1,
          startedAtUnixMs: 1_000,
          pausedAtUnixMs: null,
          elapsedBeforePauseMs: 4_000,
          scheduledStartOffsetMs: 0,
          capMs: 10_000,
          allowOvertime: false,
        },
      ],
    });

    expect(page.overallClock(match)).toBe('00:00:08');
    expect(page.periodClock(match, 1)).toBe('00:00:10');
    expect(page.periodClock(match, 2)).toBeNull();
  });

  it('reports load errors and marks a loaded page when realtime disconnects', () => {
    getMatch.mockReturnValueOnce(throwError(() => new Error('Partida indisponível')));
    const page = TestBed.runInInjectionContext(() => new SportsMatchPage());
    expect(page.pageState()).toEqual({ status: 'error', message: 'Partida indisponível' });

    getMatch.mockReturnValueOnce(of(createSportsViewerMatch()));
    page.retry();
    expect(page.pageState()).toEqual(expect.objectContaining({ status: 'ready' }));

    realtime.error(new Error('stream closed'));
    expect(page.pageState()).toEqual(expect.objectContaining({ status: 'ready', liveConnectionLost: true }));
  });
});
