import { Location } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { SportsTournamentPage } from './tournament-page';
import { SportsViewerApiService } from './sports-viewer-api.service';
import { createSportsViewerMatchForState, createSportsViewerTournament } from './sports-viewer.fixtures';
import { SportsViewerRealtimeService } from './sports-viewer-realtime.service';

describe('SportsTournamentPage', () => {
  const paramMap = new BehaviorSubject(convertToParamMap({ tournamentId: 'tournament-fixture' }));
  let realtime: Subject<void>;
  const navigate = vi.fn();
  const back = vi.fn();
  const getTournament = vi.fn(() => of(createSportsViewerTournament()));
  const watchTournament = vi.fn(() => realtime);

  beforeEach(() => {
    realtime = new Subject<void>();
    paramMap.next(convertToParamMap({ tournamentId: 'tournament-fixture' }));
    getTournament.mockReset();
    getTournament.mockReturnValue(of(createSportsViewerTournament()));
    watchTournament.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: ActivatedRoute, useValue: { paramMap } },
        { provide: Router, useValue: { navigate } },
        { provide: Location, useValue: { back } },
        { provide: SportsViewerApiService, useValue: { getTournament } },
        { provide: SportsViewerRealtimeService, useValue: { watchTournament } },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('derives category, live, upcoming, and recent views from shared fixtures', () => {
    const tournament = createSportsViewerTournament({
      matches: [
        createSportsViewerMatchForState('FINISHED'),
        createSportsViewerMatchForState('SCHEDULED'),
        createSportsViewerMatchForState('PAUSED'),
      ],
    });
    const firstCategory = tournament.categories[0];
    if (!firstCategory) throw new Error('Expected a tournament category fixture.');
    tournament.categories = [
      firstCategory,
      { ...firstCategory, id: 'category-second', name: 'Vôlei' },
    ];
    getTournament.mockReturnValue(of(tournament));
    const page = TestBed.runInInjectionContext(() => new SportsTournamentPage());
    const category = tournament.categories[0];
    const finishedMatch = tournament.matches[0];
    if (!category || !finishedMatch) throw new Error('Expected tournament fixture details.');

    expect(page.selectedCategory()?.id).toBe(tournament.categories[0]?.id);
    expect(page.liveMatches()).toHaveLength(1);
    expect(page.upcomingMatches()).toHaveLength(1);
    expect(page.recentMatches()).toHaveLength(1);
    expect(page.categoryTitle(category)).toContain('Futsal');
    expect(page.formatLabel(category)).toBe('Eliminação simples');
    expect(page.stateLabel(finishedMatch)).toBe('Finalizada');
    expect(page.participantName(finishedMatch, 'away')).toBe('Ciência da Computação');
    expect(page.locationLabel(finishedMatch)).toContain('Quadra principal');

    page.selectCategory(1);
    expect(page.selectedCategoryId()).toBe(tournament.categories[1]?.id ?? null);
    expect(page.selectedCategoryIndex()).toBe(1);
    page.openMatch('match-target');
    expect(navigate).toHaveBeenCalledWith(['/sports/match', 'match-target']);
    page.goBack();
    expect(back).toHaveBeenCalledOnce();
  });

  it('does not open a browser-only realtime stream during server rendering', () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });

    TestBed.runInInjectionContext(() => new SportsTournamentPage());

    expect(watchTournament).not.toHaveBeenCalled();
  });

  it('preserves personalized ordering and formats running overall time', () => {
    const matches = [createSportsViewerMatchForState('SCHEDULED'), createSportsViewerMatchForState('LIVE')];
    getTournament.mockReturnValue(of(createSportsViewerTournament({ matches, matchesArePersonalized: true })));
    const page = TestBed.runInInjectionContext(() => new SportsTournamentPage());
    page.now.set(15_000);
    const liveMatch = matches[1];
    if (!liveMatch) throw new Error('Expected a live match fixture.');

    expect(page.orderedMatches().map((match) => match.id)).toEqual(matches.map((match) => match.id));
    expect(
      page.overallClock({
        ...liveMatch,
        timerStartedAt: null,
        timerStartedAtUnixMs: 5_000,
        elapsedBeforePauseMs: 2_000,
      }),
    ).toBe('00:00:12');
    realtime.next();
    expect(getTournament).toHaveBeenCalledTimes(2);
  });

  it('exposes API and realtime failures without discarding loaded tournament data', () => {
    getTournament.mockReturnValueOnce(throwError(() => 'offline'));
    const page = TestBed.runInInjectionContext(() => new SportsTournamentPage());
    expect(page.pageState()).toEqual({ status: 'error', message: 'Não foi possível carregar este torneio.' });

    getTournament.mockReturnValueOnce(of(createSportsViewerTournament()));
    page.retry();
    expect(page.pageState()).toEqual(expect.objectContaining({ status: 'ready' }));

    realtime.error(new Error('closed'));
    expect(page.pageState()).toEqual(expect.objectContaining({ status: 'ready', liveConnectionLost: true }));
  });
});
