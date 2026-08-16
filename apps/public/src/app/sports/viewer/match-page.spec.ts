import { Location } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { SportsMatchPage } from './match-page';
import { SportsViewerApiService } from './sports-viewer-api.service';
import { createSportsViewerMatch } from './sports-viewer.fixtures';
import { SportsViewerRealtimeService } from './sports-viewer-realtime.service';

describe('SportsMatchPage', () => {
  const paramMap = new BehaviorSubject(convertToParamMap({ matchId: 'match-fixture' }));
  const realtime = new Subject<void>();
  const back = vi.fn();
  const getMatch = vi.fn(() => of(createSportsViewerMatch({ id: 'match-fixture' })));

  beforeEach(() => {
    paramMap.next(convertToParamMap({ matchId: 'match-fixture' }));
    getMatch.mockReset();
    getMatch.mockReturnValue(of(createSportsViewerMatch({ id: 'match-fixture' })));
    back.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap, snapshot: { queryParamMap: convertToParamMap({}) } } },
        { provide: Location, useValue: { back } },
        { provide: SportsViewerApiService, useValue: { getMatch } },
        { provide: SportsViewerRealtimeService, useValue: { watchMatch: () => realtime } },
      ],
    });
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
    expect(page.rosterIsPublic(match)).toBe(false);
    expect(page.playerName('Ana Beatriz de Souza')).toBe('Ana Souza');
    expect(page.officialName('Mariana Clara dos Santos')).toBe('Mariana S.');
    expect(page.officialRoleLabel('REFEREE')).toBe('Arbitragem');
    expect(page.rosterRoleLabel('CAPTAIN')).toBe('Capitão');
    expect(page.lossReasonLabel('SCORE')).toBe('Placar');
    expect(page.livestreamLabel('YOUTUBE')).toBe('Assistir no YouTube');
    expect(page.livestreamLabel(null)).toBe('Assistir à transmissão');

    realtime.next();
    expect(getMatch).toHaveBeenCalledTimes(2);
    paramMap.next(convertToParamMap({ id: 'match-fallback' }));
    expect(getMatch).toHaveBeenLastCalledWith('match-fallback');
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

    fixture.destroy();
  });

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
