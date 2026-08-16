import { isPlatformBrowser } from '@angular/common';
import { Directive, OnDestroy, OnInit, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ScannerFeedbackService } from '@cacic-fct/shared-angular';
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
  SportsTimerSnapshot,
} from './sports-operations.types';
import { CheckInEntry, MatchOccurrence, sortOfficialCheckInEntries } from './official-match-page.utils';

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
  readonly retainedActionCount = computed(() => this.offline.retainedActionCountForMatch(this.matchId));
  readonly unverifiedAttendanceCount = computed(() => this.offline.unverifiedAttendanceCountForMatch(this.matchId));
  readonly homeCheckInEntries = computed(() => this.sortedCheckInEntries('home'));
  readonly awayCheckInEntries = computed(() => this.sortedCheckInEntries('away'));
  readonly officialCheckInEntries = computed(() => sortOfficialCheckInEntries(this.match()?.officials ?? []));
  readonly canRequestCheckInCorrection = computed(() => {
    const state = this.match()?.state;
    return state === 'LIVE' || state === 'PAUSED';
  });
  readonly checkInStateAllowsEdit = computed(() => {
    const state = this.match()?.state;
    return (
      state === 'SCHEDULED' ||
      state === 'CHECK_IN' ||
      (this.canRequestCheckInCorrection() && this.checkInOverrideEnabled())
    );
  });
  readonly canEditCheckIn = computed(
    () => this.checkInStateAllowsEdit() && this.offline.canCollectAttendance(this.currentMatchId()),
  );
  readonly attendanceCollectionUnavailable = computed(
    () => this.checkInStateAllowsEdit() && !this.offline.canCollectAttendance(this.currentMatchId()),
  );
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
  readonly occurrences = computed(() => this.parseOccurrences(this.match()?.occurrencesJson));

  protected matchId = '';
  protected timer: ReturnType<typeof setInterval> | null = null;
  protected holdTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly subscriptions = new Subscription();
  protected handlingTimerConflict: string | null = null;
  private loadRequestId = 0;
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
    const requestId = ++this.loadRequestId;
    if (!this.matchId) {
      this.loading.set(false);
      this.error.set('A partida não foi informada.');
      return;
    }
    this.subscriptions.add(
      this.api.match(this.matchId).subscribe({
        next: (match) => {
          if (requestId !== this.loadRequestId) {
            return;
          }
          void this.offline.prepareCollector(match.id);
          this.match.set(match);
          this.revision.set(match.revision);
          this.checkInEntries.set(
            match.rosters.flatMap((roster) =>
              roster.entries.map((entry) => ({
                id: entry.id,
                attendanceSyncKey: entry.attendanceSyncKey,
                name: entry.name,
                team: roster.registrationId === match.homeRegistrationId ? 'home' : 'away',
                checkedIn: Boolean(entry.checkedInAt),
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
          if (requestId !== this.loadRequestId) {
            return;
          }
          this.loading.set(false);
          this.error.set(error instanceof Error ? error.message : 'Não foi possível carregar a partida.');
        },
      }),
    );
  }

  protected abstract dispatch(type: SportsMatchActionType, payload: Record<string, unknown>): Promise<boolean>;
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

  protected timerSnapshot(source: SportsOperationalMatch | null = this.match()): SportsTimerSnapshot {
    return {
      overall: {
        startedAtUnixMs:
          source?.timerStartedAtUnixMs ?? (source?.timerStartedAt ? new Date(source.timerStartedAt).getTime() : null),
        pausedAtUnixMs:
          source?.timerPausedAtUnixMs ?? (source?.timerPausedAt ? new Date(source.timerPausedAt).getTime() : null),
        elapsedBeforePauseMs: source?.elapsedBeforePauseMs ?? 0,
      },
      periods: source?.periodTimers.map((timer) => ({ ...timer })) ?? [],
      activePeriod: source?.scoreboard.activePeriod ?? null,
    };
  }
}
