import { isPlatformBrowser } from '@angular/common';
import {
  Directive,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ScannerFeedbackService } from '@cacic-fct/shared-angular';
import {
  DEFAULT_SPORTS_OVERLAY_PERIOD_WORD,
  normalizeSportsOverlayPeriodWord,
  SPORTS_OVERLAY_PERIOD_WORDS,
  type SportsOverlayPeriodWord,
} from '@cacic-fct/shared-data-types';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { SportsViewerRealtimeService } from '../viewer/sports-viewer-realtime.service';
import { SportsOfflineQueueService } from './sports-offline-queue.service';
import { SportsOperationsApiService } from './sports-operations-api.service';
import {
  SportsMatchActionType,
  SportsOperationalMatch,
  SportsScoreboard,
  SportsTimerConflict,
} from './sports-operations.types';
import {
  CheckInEntry,
  MatchOccurrence,
} from './official-match-page.utils';

type SportsOverlayTeam = 'both' | 'home' | 'away';

@Directive()
export abstract class OfficialMatchPageState implements OnInit, OnDestroy {
  protected readonly api = inject(SportsOperationsApiService);
  protected readonly dialog = inject(MatDialog);
  protected readonly offline = inject(SportsOfflineQueueService);
  protected readonly route = inject(ActivatedRoute);
  protected readonly realtime = inject(SportsViewerRealtimeService);
  protected readonly scannerFeedback = inject(ScannerFeedbackService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly overlayPeriodWords = SPORTS_OVERLAY_PERIOD_WORDS;

  readonly match = signal<SportsOperationalMatch | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly now = signal(Date.now());
  readonly holdingStart = signal(false);
  readonly finalizeOpen = signal(false);
  readonly outcomeStepCompleted = signal(false);
  readonly reasonStepCompleted = signal(false);
  readonly scoreStepCompleted = signal(false);
  readonly checkInOverrideEnabled = signal(false);
  readonly sidesSwapped = signal(false);
  readonly checkInEntries = signal<CheckInEntry[]>([]);
  readonly currentMatchId = signal('');
  readonly revision = signal(1);
  readonly pendingCount = computed(() => this.offline.pendingForMatch(this.matchId));
  readonly homeCheckInEntries = computed(() => this.sortedCheckInEntries('home'));
  readonly awayCheckInEntries = computed(() => this.sortedCheckInEntries('away'));
  readonly canEditCheckIn = computed(() => {
    const state = this.match()?.state;
    return (
      state === 'SCHEDULED' ||
      state === 'CHECK_IN' ||
      (this.canRequestCheckInCorrection() && this.checkInOverrideEnabled())
    );
  });
  readonly canRequestCheckInCorrection = computed(() => {
    const state = this.match()?.state;
    return state === 'LIVE' || state === 'PAUSED';
  });
  readonly elapsedLabel = computed(() => this.formatElapsed(this.elapsedMs()));
  readonly canEditScore = computed(() => {
    const state = this.match()?.state;
    return state === 'LIVE' || state === 'PAUSED';
  });
  readonly canUndoPeriod = computed(() => {
    const scoreboard = this.match()?.scoreboard;
    const activePeriod = scoreboard?.periods.at(-1);
    return (
      this.canEditScore() &&
      scoreboard?.activePeriod === activePeriod?.number &&
      activePeriod?.homeScore === 0 &&
      activePeriod.awayScore === 0
    );
  });

  readonly outcomeForm = new FormGroup({
    draw: new FormControl(false, { nonNullable: true }),
    drawWillReschedule: new FormControl(true, { nonNullable: true }),
    loserSide: new FormControl<'home' | 'away' | null>(null),
  });
  readonly reasonForm = new FormGroup({
    reason: new FormControl<'SCORE' | 'WALKOVER' | 'FORFEIT' | 'OTHER'>('SCORE', {
      nonNullable: true,
      validators: Validators.required,
    }),
    detail: new FormControl('', { nonNullable: true }),
  });
  readonly finalScoreForm = new FormGroup({
    homeScore: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    awayScore: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
  });
  readonly occurrenceForm = new FormGroup({
    kind: new FormControl<MatchOccurrence['kind']>('GENERAL', { nonNullable: true }),
    note: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(1000)],
    }),
  });
  readonly overlayForm = new FormGroup({
    team: new FormControl<SportsOverlayTeam>('both', { nonNullable: true }),
    showTeamName: new FormControl(true, { nonNullable: true }),
    showTeamIcon: new FormControl(true, { nonNullable: true }),
    showScore: new FormControl(true, { nonNullable: true }),
    showStopwatch: new FormControl(true, { nonNullable: true }),
    showPeriod: new FormControl(true, { nonNullable: true }),
    showState: new FormControl(true, { nonNullable: true }),
    periodWord: new FormControl<SportsOverlayPeriodWord>(DEFAULT_SPORTS_OVERLAY_PERIOD_WORD, {
      nonNullable: true,
      validators: Validators.required,
    }),
  });
  readonly occurrences = computed(() => this.parseOccurrences(this.match()?.occurrencesJson));
  readonly overlayUrl = computed(() => {
    this.overlayFormRevision();
    const matchId = this.currentMatchId();
    if (!matchId) {
      return '';
    }
    const value = this.overlayForm.getRawValue();
    const query = new URLSearchParams({
      team: value.team,
      teamName: value.showTeamName ? '1' : '0',
      teamIcon: value.showTeamIcon ? '1' : '0',
      score: value.showScore ? '1' : '0',
      stopwatch: value.showStopwatch ? '1' : '0',
      period: value.showPeriod ? '1' : '0',
      state: value.showState ? '1' : '0',
      periodWord: normalizeSportsOverlayPeriodWord(value.periodWord),
    });
    const origin = this.isBrowser ? window.location.origin : '';
    return `${origin}/api/sports/public/matches/${encodeURIComponent(matchId)}/overlay?${query.toString()}`;
  });

  protected matchId = '';
  protected readonly overlayFormRevision = signal(0);
  protected timer: ReturnType<typeof setInterval> | null = null;
  protected holdTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly subscriptions = new Subscription();
  protected handlingTimerConflict: string | null = null;
  protected readonly conflictEffect = effect(() => {
    const conflict = this.offline.timerConflict();
    if (conflict && conflict.matchId === this.currentMatchId() && this.handlingTimerConflict !== conflict.matchId) {
      this.handlingTimerConflict = conflict.matchId;
      void this.resolveTimerConflict(conflict);
    }
  });

  ngOnInit(): void {
    this.matchId = this.route.snapshot.paramMap.get('matchId') ?? '';
    this.currentMatchId.set(this.matchId);
    this.subscriptions.add(
      this.overlayForm.valueChanges.subscribe(() => this.overlayFormRevision.update((revision) => revision + 1)),
    );
    this.offline.start();
    this.timer = setInterval(() => this.now.set(Date.now()), 1000);
    this.load();
    this.watchMatch();
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.cancelStartHold();
    this.subscriptions.unsubscribe();
  }

  load(): void {
    if (!this.matchId) {
      this.loading.set(false);
      this.error.set('A partida não foi informada.');
      return;
    }
    this.api.match(this.matchId).subscribe({
      next: (match) => {
        this.match.set(match);
        this.revision.set(match.revision);
        this.checkInEntries.set(
          match.rosters.flatMap((roster) =>
            roster.entries.map((entry) => ({
              id: entry.id,
              name: entry.name,
              team: roster.registrationId === match.homeRegistrationId ? 'home' : 'away',
              checkedIn: entry.status === 'CHECKED_IN',
              role: entry.role,
              shirtNumber: entry.shirtNumber,
            })),
          ),
        );
        this.finalScoreForm.setValue({
          homeScore: match.scoreboard.homeScore,
          awayScore: match.scoreboard.awayScore,
        });
        this.loading.set(false);
        this.error.set(null);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof Error ? error.message : 'Não foi possível carregar a partida.');
      },
    });
  }

  protected abstract dispatch(
    type: SportsMatchActionType,
    payload: Record<string, unknown>,
  ): Promise<void>;
  protected abstract registerScannedAttendance(code: string): Promise<void>;
  protected abstract sortedCheckInEntries(team: CheckInEntry['team']): CheckInEntry[];
  protected abstract formatElapsed(value: number): string;
  protected abstract elapsedMs(): number;
  protected abstract parseOccurrences(value: string | null | undefined): MatchOccurrence[];
  protected abstract resolveTimerConflict(conflict: SportsTimerConflict): Promise<void>;
  protected abstract watchMatch(): void;
  abstract cancelStartHold(): void;
  protected abstract uuid(): string;
  protected abstract showError(error: unknown): void;
  protected abstract registrationId(side: 'home' | 'away'): string | null;
  protected abstract scoreboardFromFinalForm(current: SportsScoreboard): {
    home: number;
    away: number;
    activePeriodNumber: number | null;
    periods: Array<{
      number: number;
      label: string;
      home: number;
      away: number;
      closed: boolean;
    }>;
  };
}
