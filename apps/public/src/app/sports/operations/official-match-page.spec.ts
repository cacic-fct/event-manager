import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { signal, WritableSignal } from '@angular/core';
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
  let officialCheckIns: Array<{ officialAssignmentId: string }>;
  let scannerResult: 'sent' | 'queued';
  let pendingOffline: WritableSignal<number>;
  let retainedActions: WritableSignal<number>;
  let unverifiedAttendances: WritableSignal<number>;
  let attendanceAvailable: WritableSignal<boolean>;
  let dispatchFailure: Error | null;

  beforeEach(async () => {
    actions = [];
    checkIns = [];
    officialCheckIns = [];
    scannerResult = 'sent';
    pendingOffline = signal(0);
    retainedActions = signal(0);
    unverifiedAttendances = signal(0);
    attendanceAvailable = signal(true);
    dispatchFailure = null;
    TestBed.configureTestingModule({
      imports: [OfficialSportsMatchPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ matchId: 'match-story' }),
              queryParamMap: convertToParamMap({}),
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
            pendingForMatch: () => pendingOffline(),
            retainedActionCountForMatch: () => retainedActions(),
            unverifiedAttendanceCountForMatch: () => unverifiedAttendances(),
            canCollectAttendance: () => attendanceAvailable(),
            prepareCollector: () => Promise.resolve(true),
            timerConflict: signal(null),
            start: () => undefined,
            sync: () => Promise.resolve(),
            dispatch: async (action: SportsMatchAction) => {
              if (dispatchFailure) {
                throw dispatchFailure;
              }
              actions.push(action);
              return 'sent';
            },
            dispatchCheckIn: (submission: { rosterEntryId: string; present?: boolean }) => {
              checkIns.push(submission);
              return Promise.resolve('sent');
            },
            dispatchOfficialCheckIn: (submission: { officialAssignmentId: string }) => {
              officialCheckIns.push(submission);
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

  it('distinguishes uploadable entries from retained prior-user operations', () => {
    pendingOffline.set(2);
    retainedActions.set(3);
    unverifiedAttendances.set(4);
    fixture.detectChanges();

    const toolbar = fixture.debugElement.query(By.css('.match-toolbar')).nativeElement as HTMLElement;
    const toolbarText = toolbar.textContent?.replace(/\s+/g, ' ').trim();
    expect(toolbarText).toContain('2 para enviar');
    expect(toolbarText).toContain('3 ações de outra pessoa mantidas neste dispositivo');
    expect(toolbarText).toContain('4 presenças antigas sem credencial mantidas');
  });

  it('blocks offline attendance collection when this device has no collector credential', () => {
    component.match.update((match) => (match ? { ...match, state: 'CHECK_IN' } : match));
    attendanceAvailable.set(false);
    fixture.detectChanges();

    const status = fixture.debugElement.query(By.css('.check-in [role="status"]')).nativeElement as HTMLElement;
    expect(status.textContent).toContain('Conecte este dispositivo antes da partida');
    expect(component.canEditCheckIn()).toBe(false);
    expect(fixture.debugElement.query(By.css('.check-in-actions button'))).toBeNull();
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

  it('lists assigned officials in a separate row and registers their attendance', async () => {
    component.match.update((match) => (match ? { ...match, state: 'CHECK_IN' } : match));
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.check-in-officials'))).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.check-in-officials').textContent).toContain('Mariana S.');
    expect(fixture.nativeElement.querySelector('.check-in-officials').textContent).toContain('Intermediação');

    const official = component.officialCheckInEntries()[0];
    await component.toggleOfficialCheckIn(official);
    fixture.detectChanges();

    expect(officialCheckIns).toEqual([expect.objectContaining({ officialAssignmentId: official.id })]);
    expect(component.officialCheckInEntries()[0]).toEqual(expect.objectContaining({ checkedIn: true }));
    expect(
      (fixture.debugElement.query(By.css('.check-in-official-grid button')).nativeElement as HTMLButtonElement).disabled,
    ).toBe(true);
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
    expect(button.querySelector('.hold-progress')).not.toBeNull();
    expect(button.querySelector('.hold-progress-content')).not.toBeNull();

    button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    expect(component.holdingStart()).toBe(false);
  });

  it('does not dispatch the start action twice when the hold is started repeatedly', async () => {
    vi.useFakeTimers();
    try {
      component.match.update((match) => (match ? { ...match, state: 'SCHEDULED' } : match));

      component.startHold();
      component.startHold();
      await vi.advanceTimersByTimeAsync(900);

      expect(actions.map((action) => action.type)).toEqual(['START']);
    } finally {
      component.cancelStartHold();
      vi.useRealTimers();
    }
  });

  it('keeps an occurrence draft when the submission fails', async () => {
    dispatchFailure = new Error('Não foi possível enviar a ação.');
    component.occurrenceForm.controls.note.setValue('Substituição pendente de confirmação');

    await component.saveOccurrence();

    expect(component.occurrenceForm.controls.note.value).toBe('Substituição pendente de confirmação');
  });

  it('keeps the finalization review open when the result submission fails', async () => {
    dispatchFailure = new Error('Conflito de revisão');
    component.finalizeOpen.set(true);
    component.outcomeForm.patchValue({ draw: true, loserSide: null });
    component.finalScoreForm.setValue({ homeScore: 2, awayScore: 1 });

    await component.finalize();

    expect(component.finalizeOpen()).toBe(true);
  });

  it('starts only for the primary pointer and prevents the native pointer gesture', () => {
    component.match.update((match) => (match ? { ...match, state: 'SCHEDULED' } : match));

    const secondaryPointer = new Event('pointerdown', { cancelable: true }) as PointerEvent;
    Object.defineProperties(secondaryPointer, {
      button: { value: 0 },
      isPrimary: { value: false },
    });
    component.startHold(secondaryPointer);
    expect(component.holdingStart()).toBe(false);

    const primaryPointer = new Event('pointerdown', { cancelable: true }) as PointerEvent;
    Object.defineProperties(primaryPointer, {
      button: { value: 0 },
      isPrimary: { value: true },
    });
    component.startHold(primaryPointer);

    expect(primaryPointer.defaultPrevented).toBe(true);
    expect(component.holdingStart()).toBe(true);
    component.cancelStartHold();
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

    const overlayUrl = new URL(overlayBuilder.overlayUrl(), 'https://sports.example/app/');
    expect(overlayUrl.pathname).toBe('/api/sports/public/matches/match-story/overlay');
    expect(overlayUrl.pathname).not.toContain('/app/');
    expect(overlayBuilder.overlayUrl()).toContain('team=away');
    expect(overlayBuilder.overlayUrl()).toContain('teamName=0');
    expect(overlayBuilder.overlayUrl()).toContain('stopwatch=0');
    expect(overlayBuilder.overlayUrl()).toContain('periodWord=Turno');
  });
});
