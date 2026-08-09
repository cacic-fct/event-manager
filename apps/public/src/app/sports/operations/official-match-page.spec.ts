import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { NEVER, of } from 'rxjs';
import { OfficialSportsMatchPage } from './official-match-page';
import { SportsOfflineQueueService } from './sports-offline-queue.service';
import { createSportsOperationalMatch } from './sports-operations.fixtures';
import { SportsOperationsApiService } from './sports-operations-api.service';
import type { SportsMatchAction } from './sports-operations.types';
import { SportsViewerRealtimeService } from '../viewer/sports-viewer-realtime.service';
import { SportsMatchOverlayBuilderComponent } from '@cacic-fct/shared-angular';

describe('OfficialSportsMatchPage', () => {
  let fixture: ComponentFixture<OfficialSportsMatchPage>;
  let component: OfficialSportsMatchPage;
  let actions: SportsMatchAction[];
  let checkIns: Array<{ rosterEntryId: string; present?: boolean }>;
  let scannerResult: 'sent' | 'queued';

  beforeEach(async () => {
    actions = [];
    checkIns = [];
    scannerResult = 'sent';
    TestBed.configureTestingModule({
      imports: [OfficialSportsMatchPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ matchId: 'match-story' }),
            },
          },
        },
        {
          provide: SportsOperationsApiService,
          useValue: {
            match: () => of(createSportsOperationalMatch('LIVE')),
          },
        },
        {
          provide: SportsOfflineQueueService,
          useValue: {
            pendingForMatch: () => 0,
            timerConflict: signal(null),
            start: () => undefined,
            sync: () => Promise.resolve(),
            dispatch: async (action: SportsMatchAction) => {
              actions.push(action);
              return 'sent';
            },
            dispatchCheckIn: (submission: { rosterEntryId: string; present?: boolean }) => {
              checkIns.push(submission);
              return Promise.resolve('sent');
            },
            dispatchScannerCheckIn: () => Promise.resolve(scannerResult),
            attachTimerSnapshot: () => undefined,
          },
        },
        {
          provide: SportsViewerRealtimeService,
          useValue: { watchMatch: () => NEVER },
        },
      ],
    });
    TestBed.overrideComponent(OfficialSportsMatchPage, {
      add: {
        providers: [{ provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of('user:scanner') }) } }],
      },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(OfficialSportsMatchPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => fixture.destroy());

  it('swaps visual sides while preserving canonical score action sides', async () => {
    expect(component.displaySide('left')).toBe('home');

    component.swapSides();
    expect(component.displaySide('left')).toBe('away');

    await component.changeScore(component.displaySide('left'), 1);

    expect(JSON.parse(actions[0]?.payloadJson ?? '{}')).toEqual(expect.objectContaining({ side: 'AWAY', amount: 1 }));
    expect(component.scoreFor('away')).toBe(2);
  });

  it('undoes only a newly created empty period through an audited score correction', async () => {
    component.match.update((match) =>
      match
        ? {
            ...match,
            timerPeriodDurationMs: 45 * 60_000,
            timerPeriodStartOffsetsMs: [0, 45 * 60_000, 95 * 60_000],
            timerAllowOvertime: false,
          }
        : match,
    );
    await component.rollPeriod();

    expect(component.match()?.scoreboard.periods).toHaveLength(3);
    expect(component.match()?.periodTimers.at(-1)).toEqual(
      expect.objectContaining({
        periodNumber: 3,
        scheduledStartOffsetMs: 95 * 60_000,
        capMs: 45 * 60_000,
        allowOvertime: false,
      }),
    );
    expect(component.canUndoPeriod()).toBe(true);

    await component.undoPeriod();

    expect(component.match()?.scoreboard.periods).toHaveLength(2);
    expect(component.match()?.scoreboard.activePeriod).toBe(2);
    expect(component.match()?.state).toBe('LIVE');
    expect(component.match()?.periodTimers).toHaveLength(2);
    expect(component.match()?.periodTimers.at(-1)?.periodNumber).toBe(2);
    expect(actions.map((action) => action.type)).toEqual(['PERIOD_ROLL', 'SCORE_CORRECTION']);
    expect(JSON.parse(actions[1]?.payloadJson ?? '{}')).toEqual({
      scoreboard: expect.objectContaining({
        home: 2,
        away: 1,
        activePeriodNumber: 2,
        periods: [
          {
            number: 1,
            label: '1º tempo',
            home: 1,
            away: 1,
            closed: true,
          },
          {
            number: 2,
            label: '2º tempo',
            home: 1,
            away: 0,
            closed: false,
          },
        ],
      }),
      stopwatch: expect.objectContaining({ state: 'LIVE', activePeriod: 2 }),
    });
  });

  it('restores a paused stopwatch when undoing a newly created period', async () => {
    const pausedMatch = createSportsOperationalMatch('PAUSED');
    component.match.set(pausedMatch);
    component.revision.set(pausedMatch.revision);

    await component.rollPeriod();
    await component.undoPeriod();

    expect(component.match()?.state).toBe('PAUSED');
    expect(component.match()?.timerStartedAtUnixMs).toBeNull();
    expect(component.match()?.elapsedBeforePauseMs).toBe(pausedMatch.elapsedBeforePauseMs);
    expect(component.match()?.periodTimers).toEqual(pausedMatch.periodTimers);
    expect(JSON.parse(actions[1]?.payloadJson ?? '{}').stopwatch).toEqual(
      expect.objectContaining({ state: 'PAUSED', activePeriod: 2 }),
    );
  });

  it('keeps a paused stopwatch paused when rolling into a new period', async () => {
    const pausedMatch = createSportsOperationalMatch('PAUSED');
    component.match.set(pausedMatch);
    component.revision.set(pausedMatch.revision);

    await component.rollPeriod();

    expect(component.match()?.state).toBe('PAUSED');
    expect(component.match()?.timerStartedAtUnixMs).toBeNull();
    expect(component.match()?.timerPausedAtUnixMs).not.toBeNull();
    expect(component.match()?.periodTimers.at(-1)).toEqual(
      expect.objectContaining({ startedAtUnixMs: null, pausedAtUnixMs: expect.any(Number) }),
    );
  });

  it('does not offer undo when the active period already contains a score', () => {
    expect(component.canUndoPeriod()).toBe(false);
  });

  it('protects live check-in corrections until the official explicitly unlocks them', async () => {
    const entry = component.homeCheckInEntries()[0];

    expect(component.canEditCheckIn()).toBe(false);
    await component.toggleCheckIn(entry);
    expect(checkIns).toHaveLength(0);

    component.requestCheckInEdit();
    expect(component.canEditCheckIn()).toBe(true);

    await component.toggleCheckIn(entry);
    expect(checkIns).toEqual([
      expect.objectContaining({
        rosterEntryId: entry.id,
        present: !entry.checkedIn,
      }),
    ]);

    component.lockCheckIn();
    expect(component.canEditCheckIn()).toBe(false);
  });

  it('advances the optimistic revision after queueing an offline scanner check-in', async () => {
    component.match.update((match) => (match ? { ...match, state: 'CHECK_IN' } : match));
    scannerResult = 'queued';
    const revision = component.revision();

    component.openCheckInScanner();
    await fixture.whenStable();

    expect(component.revision()).toBe(revision + 1);
  });

  it('supports holding the start control with the keyboard', () => {
    component.match.update((match) => (match ? { ...match, state: 'SCHEDULED' } : match));
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.hold-button') as HTMLButtonElement;

    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(component.holdingStart()).toBe(true);

    button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    expect(component.holdingStart()).toBe(false);
  });

  it('sorts athletes alphabetically during check-in and by shirt number after the match starts', () => {
    component.checkInEntries.set([
      { id: '3', name: 'Zélia', team: 'home', checkedIn: false, role: 'PLAYER', shirtNumber: '2' },
      { id: '1', name: 'Álvaro', team: 'home', checkedIn: false, role: 'PLAYER', shirtNumber: '10' },
      { id: '2', name: 'Beatriz', team: 'home', checkedIn: false, role: 'PLAYER', shirtNumber: null },
    ]);
    component.match.update((match) => (match ? { ...match, state: 'CHECK_IN' } : match));

    expect(component.homeCheckInEntries().map((entry) => entry.name)).toEqual(['Álvaro', 'Beatriz', 'Zélia']);

    component.match.update((match) => (match ? { ...match, state: 'LIVE' } : match));

    expect(component.homeCheckInEntries().map((entry) => entry.name)).toEqual(['Zélia', 'Álvaro', 'Beatriz']);
  });

  it('pauses a live stopwatch before opening the final result review', async () => {
    component.openFinalize();
    await fixture.whenStable();

    expect(actions.map((action) => action.type)).toContain('PAUSE');
    expect(component.match()?.state).toBe('PAUSED');
    expect(component.finalizeOpen()).toBe(true);
  });

  it('builds an OBS overlay link from the selected presentation options', () => {
    const overlayBuilder = fixture.debugElement.query(By.directive(SportsMatchOverlayBuilderComponent))
      .componentInstance as SportsMatchOverlayBuilderComponent;
    overlayBuilder.overlayForm.patchValue({
      team: 'away',
      showTeamName: false,
      showTeamIcon: true,
      showScore: true,
      showStopwatch: false,
      showPeriod: true,
      showState: false,
      periodWord: 'Turno',
    });

    expect(overlayBuilder.overlayUrl()).toContain('/api/sports/public/matches/match-story/overlay?');
    expect(overlayBuilder.overlayUrl()).toContain('team=away');
    expect(overlayBuilder.overlayUrl()).toContain('teamName=0');
    expect(overlayBuilder.overlayUrl()).toContain('stopwatch=0');
    expect(overlayBuilder.overlayUrl()).toContain('periodWord=Turno');
  });
});
