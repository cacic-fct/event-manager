import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { AztecScannerDialogComponent, ScannerFeedbackService } from '@cacic-fct/shared-angular';
import {
  DEFAULT_SPORTS_OVERLAY_PERIOD_WORD,
  normalizeSportsOverlayPeriodWord,
  SPORTS_OVERLAY_PERIOD_WORDS,
  type SportsOverlayPeriodWord,
} from '@cacic-fct/shared-data-types';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { SportsViewerRealtimeService } from '../viewer/sports-viewer-realtime.service';
import { SportsOfflineQueueService } from './sports-offline-queue.service';
import { SportsOperationsApiService } from './sports-operations-api.service';
import { SportsConfirmationDialog, SportsConfirmationDialogData } from './sports-confirmation-dialog';
import {
  SportsMatchAction,
  SportsMatchActionType,
  SportsOperationalMatch,
  SportsScoreboard,
  SportsTimerConflict,
  SportsTimerSnapshot,
} from './sports-operations.types';
import { SportsTimerConflictDialog } from './sports-timer-conflict-dialog';

interface CheckInEntry {
  id: string;
  name: string;
  team: 'home' | 'away';
  checkedIn: boolean;
  role: 'PLAYER' | 'CAPTAIN' | 'COACH';
  shirtNumber?: string | null;
}

interface MatchOccurrence {
  occurrenceId: string;
  kind: 'SUBSTITUTION' | 'INJURY' | 'DISCIPLINE' | 'GENERAL';
  note: string;
  authoredAt?: string;
}

type SportsOverlayTeam = 'both' | 'home' | 'away';

@Component({
  selector: 'app-official-sports-match-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatDialogModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatSelectModule,
    MatSnackBarModule,
    MatStepperModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './official-match-page.html',
  styleUrl: './official-match-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfficialSportsMatchPage implements OnInit, OnDestroy {
  private readonly api = inject(SportsOperationsApiService);
  private readonly dialog = inject(MatDialog);
  protected readonly offline = inject(SportsOfflineQueueService);
  private readonly route = inject(ActivatedRoute);
  private readonly realtime = inject(SportsViewerRealtimeService);
  private readonly scannerFeedback = inject(ScannerFeedbackService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

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

  private matchId = '';
  private readonly overlayFormRevision = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly subscriptions = new Subscription();
  private handlingTimerConflict: string | null = null;
  private readonly conflictEffect = effect(() => {
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

  startHold(): void {
    const state = this.match()?.state;
    if (this.busy() || (state !== 'SCHEDULED' && state !== 'CHECK_IN')) {
      return;
    }
    this.holdingStart.set(true);
    this.holdTimer = setTimeout(() => {
      this.holdTimer = null;
      this.holdingStart.set(false);
      void this.dispatch('START', {});
    }, 900);
  }

  cancelStartHold(): void {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    this.holdingStart.set(false);
  }

  async togglePause(): Promise<void> {
    const type = this.match()?.state === 'PAUSED' ? 'RESUME' : 'PAUSE';
    await this.dispatch(type, {});
  }

  async changeScore(side: 'home' | 'away', amount: number): Promise<void> {
    const score = side === 'home' ? this.match()?.scoreboard.homeScore : this.match()?.scoreboard.awayScore;
    if ((score ?? 0) + amount < 0) {
      return;
    }
    await this.dispatch('SCORE_DELTA', {
      side: side.toUpperCase(),
      amount,
      periodNumber: this.match()?.scoreboard.activePeriod ?? undefined,
    });
  }

  async rollPeriod(): Promise<void> {
    await this.dispatch('PERIOD_ROLL', {});
  }

  async saveOccurrence(): Promise<void> {
    if (this.occurrenceForm.invalid || !this.canEditScore()) {
      return;
    }
    const value = this.occurrenceForm.getRawValue();
    await this.dispatch('OCCURRENCE', {
      occurrenceId: this.uuid(),
      kind: value.kind,
      note: value.note.trim(),
    });
    this.occurrenceForm.controls.note.reset();
  }

  async undoPeriod(): Promise<void> {
    const match = this.match();
    if (!match || !this.canUndoPeriod()) {
      return;
    }
    const periods = match.scoreboard.periods.slice(0, -1);
    const activePeriod = periods.at(-1)?.number ?? null;
    await this.dispatch('SCORE_CORRECTION', {
      scoreboard: {
        home: match.scoreboard.homeScore,
        away: match.scoreboard.awayScore,
        activePeriodNumber: activePeriod,
        periods: periods.map((period) => ({
          number: period.number,
          label: period.label,
          home: period.homeScore,
          away: period.awayScore,
          closed: period.number !== activePeriod,
        })),
      },
    });
  }

  swapSides(): void {
    this.sidesSwapped.update((swapped) => !swapped);
  }

  async copyOverlayUrl(): Promise<void> {
    if (!this.isBrowser || !this.overlayUrl() || !navigator.clipboard) {
      this.snackbar.open('Copie o link exibido manualmente para usar no OBS.', 'Fechar', { duration: 5000 });
      return;
    }
    try {
      await navigator.clipboard.writeText(this.overlayUrl());
      this.snackbar.open('Link do overlay copiado.', 'Fechar', { duration: 2500 });
    } catch {
      this.snackbar.open('Não foi possível copiar o link. Selecione-o e copie manualmente.', 'Fechar', {
        duration: 5000,
      });
    }
  }

  async toggleCheckIn(entry: CheckInEntry): Promise<void> {
    if (this.busy() || !this.canEditCheckIn()) {
      return;
    }
    const present = !entry.checkedIn;
    this.busy.set(true);
    try {
      const result = await this.offline.dispatchCheckIn({
        clientId: this.uuid(),
        matchId: this.matchId,
        rosterEntryId: entry.id,
        checkedInAt: new Date().toISOString(),
        offline: false,
        present,
      });
      this.checkInEntries.update((entries) =>
        entries.map((candidate) =>
          candidate.id === entry.id ? { ...candidate, checkedIn: present } : candidate),
      );
      this.revision.update((revision) => revision + 1);
      this.snackbar.open(
        result === 'queued'
          ? `A correção de ${entry.name} foi salva neste dispositivo e será sincronizada.`
          : present
            ? `${entry.name} confirmado na partida.`
            : `Presença de ${entry.name} removida.`,
        'Fechar',
        { duration: 3500 },
      );
    } catch (error: unknown) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  requestCheckInEdit(): void {
    if (!this.canRequestCheckInCorrection()) {
      return;
    }
    this.dialog
      .open<SportsConfirmationDialog, SportsConfirmationDialogData, boolean>(SportsConfirmationDialog, {
        data: {
          title: 'Editar check-in após o início?',
          message: 'A partida já saiu da etapa de check-in. Desbloqueie somente para corrigir uma presença.',
          confirmLabel: 'Sim, editar',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          this.checkInOverrideEnabled.set(true);
        }
      });
  }

  lockCheckIn(): void {
    this.checkInOverrideEnabled.set(false);
  }

  openCheckInScanner(): void {
    if (!this.canEditCheckIn() || this.busy()) {
      return;
    }
    this.dialog.open<AztecScannerDialogComponent, unknown, string>(AztecScannerDialogComponent, {
      width: 'min(560px, 96vw)',
      maxWidth: '96vw',
      data: {
        acceptedPrefixes: ['user:'],
        title: 'Escanear atleta da partida',
        mode: ['Aztec'],
      },
    }).afterClosed().subscribe((code) => {
      if (code) {
        void this.registerScannedAttendance(code);
      }
    });
  }

  openFinalize(): void {
    this.dialog
      .open<SportsConfirmationDialog, SportsConfirmationDialogData, boolean>(SportsConfirmationDialog, {
        data: {
          title: 'Finalizar esta partida?',
          message: 'Sim abre a revisão final do resultado. Nenhum resultado será enviado antes da última confirmação.',
          confirmLabel: 'Sim, revisar resultado',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }
        void this.beginFinalization();
      });
  }

  completeOutcomeStep(stepper: MatStepper): void {
    const outcome = this.outcomeForm.getRawValue();
    if (!outcome.draw && !outcome.loserSide) {
      this.snackbar.open('Escolha qual equipe perdeu antes de continuar.', 'Fechar', { duration: 4000 });
      return;
    }
    this.outcomeStepCompleted.set(true);
    stepper.next();
  }

  completeReasonStep(stepper: MatStepper): void {
    if (this.reasonForm.invalid) {
      this.reasonForm.markAllAsTouched();
      return;
    }
    this.reasonStepCompleted.set(true);
    stepper.next();
  }

  completeScoreStep(stepper: MatStepper): void {
    if (this.finalScoreForm.invalid) {
      this.finalScoreForm.markAllAsTouched();
      return;
    }
    this.scoreStepCompleted.set(true);
    stepper.next();
  }

  private async beginFinalization(): Promise<void> {
    if (this.match()?.state === 'LIVE') {
      await this.dispatch('PAUSE', {});
    }
    this.prepareFinalize();
    if (this.isBrowser) {
      setTimeout(() => {
        document.getElementById('match-end')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    }
  }

  private prepareFinalize(): void {
    const match = this.match();
    if (!match) {
      return;
    }
    this.finalScoreForm.setValue({
      homeScore: match.scoreboard.homeScore,
      awayScore: match.scoreboard.awayScore,
    });
    const loserSide =
      match.scoreboard.homeScore === match.scoreboard.awayScore
        ? null
        : match.scoreboard.homeScore < match.scoreboard.awayScore
          ? 'home'
          : 'away';
    this.outcomeForm.patchValue({ draw: loserSide === null, loserSide });
    this.outcomeStepCompleted.set(false);
    this.reasonStepCompleted.set(false);
    this.scoreStepCompleted.set(false);
    this.finalizeOpen.set(true);
  }

  closeFinalize(): void {
    this.finalizeOpen.set(false);
  }

  async finalize(): Promise<void> {
    const match = this.match();
    if (!match || this.finalScoreForm.invalid || this.reasonForm.invalid) {
      return;
    }
    const draw = this.outcomeForm.controls.draw.value;
    const loserSide = this.outcomeForm.controls.loserSide.value;
    if (!draw && !loserSide) {
      this.snackbar.open('Escolha qual equipe perdeu.', 'Fechar', { duration: 4000 });
      return;
    }
    const winnerSide = loserSide === 'home' ? 'away' : 'home';
    const winnerRegistrationId = draw ? null : this.registrationId(winnerSide);
    const loserRegistrationId = draw ? null : this.registrationId(loserSide as 'home' | 'away');
    if (!draw && (!winnerRegistrationId || !loserRegistrationId)) {
      this.snackbar.open(
        'A identificação operacional das equipes não foi carregada. Reabra a partida pelo atalho de arbitragem.',
        'Fechar',
        { duration: 6000 },
      );
      return;
    }
    await this.dispatch('FINALIZE', {
      draw,
      drawWillReschedule: draw ? this.outcomeForm.controls.drawWillReschedule.value : undefined,
      winnerRegistrationId: winnerRegistrationId ?? undefined,
      loserRegistrationId: loserRegistrationId ?? undefined,
      lossReason: draw ? undefined : this.reasonForm.controls.reason.value,
      lossReasonDetail: draw ? undefined : this.reasonForm.controls.detail.value || undefined,
      scoreboard: this.scoreboardFromFinalForm(match.scoreboard),
    });
    this.finalizeOpen.set(false);
  }

  teamName(side: 'home' | 'away'): string {
    const team = side === 'home' ? this.match()?.homeTeam : this.match()?.awayTeam;
    return team?.name ?? 'Equipe a definir';
  }

  teamLogo(side: 'home' | 'away'): string | null {
    const team = side === 'home' ? this.match()?.homeTeam : this.match()?.awayTeam;
    return team?.logoUrl ?? null;
  }

  checkInDetail(entry: CheckInEntry): string {
    const role = {
      PLAYER: 'Atleta',
      CAPTAIN: 'Capitão',
      COACH: 'Técnico',
    }[entry.role];
    return entry.shirtNumber == null ? role : `${role} - camisa ${entry.shirtNumber}`;
  }

  periodElapsedLabel(periodNumber: number): string | null {
    const timer = this.match()?.periodTimers.find((candidate) => candidate.periodNumber === periodNumber);
    if (!timer) {
      return null;
    }
    const running = timer.startedAtUnixMs == null ? 0 : Math.max(0, this.now() - timer.startedAtUnixMs);
    const elapsed = timer.elapsedBeforePauseMs + running;
    const displayed = timer.capMs != null && !timer.allowOvertime ? Math.min(elapsed, timer.capMs) : elapsed;
    return this.formatElapsed(displayed);
  }

  private sortedCheckInEntries(team: CheckInEntry['team']): CheckInEntry[] {
    const entries = this.checkInEntries().filter((entry) => entry.team === team);
    const sortByShirt = this.match()?.state !== 'SCHEDULED' && this.match()?.state !== 'CHECK_IN';
    return [...entries].sort((left, right) => {
      if (sortByShirt) {
        const leftHasShirt = Boolean(left.shirtNumber?.trim());
        const rightHasShirt = Boolean(right.shirtNumber?.trim());
        if (leftHasShirt !== rightHasShirt) {
          return leftHasShirt ? -1 : 1;
        }
        if (leftHasShirt && rightHasShirt) {
          const shirtOrder = (left.shirtNumber ?? '').localeCompare(right.shirtNumber ?? '', 'pt-BR', {
            numeric: true,
            sensitivity: 'base',
          });
          if (shirtOrder !== 0) {
            return shirtOrder;
          }
        }
      }
      return left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' });
    });
  }

  displaySide(position: 'left' | 'right'): 'home' | 'away' {
    if (position === 'left') {
      return this.sidesSwapped() ? 'away' : 'home';
    }
    return this.sidesSwapped() ? 'home' : 'away';
  }

  scoreFor(side: 'home' | 'away'): number {
    return side === 'home' ? (this.match()?.scoreboard.homeScore ?? 0) : (this.match()?.scoreboard.awayScore ?? 0);
  }

  stateLabel(state: SportsOperationalMatch['state']): string {
    const labels: Record<SportsOperationalMatch['state'], string> = {
      SCHEDULED: 'Agendada',
      CHECK_IN: 'Check-in',
      LIVE: 'Ao vivo',
      PAUSED: 'Pausada',
      AWAITING_REVIEW: 'Em revisão',
      CANCELED: 'Cancelada',
      DRAW: 'Empate',
      FINISHED: 'Finalizada',
    };
    return labels[state];
  }

  reasonLabel(reason: 'SCORE' | 'WALKOVER' | 'FORFEIT' | 'OTHER'): string {
    return {
      SCORE: 'Resultado no placar',
      WALKOVER: 'W.O. (walkover)',
      FORFEIT: 'Desistência',
      OTHER: 'Outro motivo',
    }[reason];
  }

  occurrenceKindLabel(kind: MatchOccurrence['kind']): string {
    return {
      SUBSTITUTION: 'Substituição',
      INJURY: 'Lesão ou atendimento',
      DISCIPLINE: 'Ocorrência disciplinar',
      GENERAL: 'Anotação geral',
    }[kind];
  }

  private async dispatch(type: SportsMatchActionType, payload: Record<string, unknown>): Promise<void> {
    const match = this.match();
    if (!match || this.busy()) {
      return;
    }
    this.busy.set(true);
    const action: SportsMatchAction = {
      clientId: this.uuid(),
      matchId: match.id,
      baseRevision: this.revision(),
      type,
      payloadJson: JSON.stringify(payload),
      authoredAt: new Date().toISOString(),
      offline: false,
    };
    try {
      const result = await this.offline.dispatch(action);
      this.revision.update((revision) => revision + 1);
      this.applyOptimistic(type, payload, action.authoredAt);
      if (result === 'queued' && this.isTimerAction(type)) {
        this.offline.attachTimerSnapshot(action.clientId, this.timerSnapshot());
      }
      const message =
        result === 'queued'
          ? 'Ação salva neste dispositivo. Ela será enviada quando a conexão voltar.'
          : this.actionSuccessMessage(type);
      if (message) {
        this.snackbar.open(message, 'Fechar', { duration: 3500 });
      }
    } catch (error: unknown) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  private async registerScannedAttendance(code: string): Promise<void> {
    this.busy.set(true);
    try {
      const result = await this.offline.dispatchScannerCheckIn({
        clientId: this.uuid(),
        matchId: this.matchId,
        code,
        checkedInAt: new Date().toISOString(),
        offline: false,
      });
      this.scannerFeedback.show('valid');
      this.snackbar.open(
        result === 'queued'
          ? 'Leitura salva neste dispositivo. A presença será conferida quando a conexão voltar.'
          : 'Presença registrada pelo scanner.',
        'Fechar',
        { duration: 4000 },
      );
      if (result === 'sent') {
        this.load();
      }
    } catch (error: unknown) {
      this.scannerFeedback.show('invalid');
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  private actionSuccessMessage(type: SportsMatchActionType): string | null {
    const messages: Record<SportsMatchActionType, string | null> = {
      CHECK_IN: null,
      START: 'Partida iniciada.',
      PAUSE: 'Cronômetro pausado.',
      RESUME: 'Cronômetro retomado.',
      SCORE_DELTA: null,
      SCORE_CORRECTION: 'Correção do placar aplicada.',
      PERIOD_ROLL: 'Novo período iniciado.',
      TIMER_RECONCILE: 'Cronômetro reconciliado.',
      OCCURRENCE: 'Anotação salva.',
      FINALIZE: 'Resultado enviado para revisão.',
      CANCEL: 'Pedido de remarcação enviado.',
      FORFEIT: 'Desistência enviada para revisão.',
    };
    return messages[type];
  }

  private applyOptimistic(type: SportsMatchActionType, payload: Record<string, unknown>, authoredAt: string): void {
    this.match.update((match) => {
      if (!match) {
        return match;
      }
      if (type === 'START' || type === 'RESUME') {
        const startedAtUnixMs = new Date(authoredAt).getTime();
        const periodNumber = match.scoreboard.activePeriod ?? match.scoreboard.periods.at(-1)?.number ?? 1;
        const existingTimer = match.periodTimers.find((timer) => timer.periodNumber === periodNumber);
        return {
          ...match,
          state: 'LIVE',
          timerStartedAt: authoredAt,
          timerStartedAtUnixMs: startedAtUnixMs,
          timerPausedAt: null,
          timerPausedAtUnixMs: null,
          periodTimers: existingTimer
            ? match.periodTimers.map((timer) => timer.periodNumber === periodNumber
              ? { ...timer, startedAtUnixMs, pausedAtUnixMs: null }
              : timer)
            : [
                ...match.periodTimers,
                {
                  periodNumber,
                  startedAtUnixMs,
                  pausedAtUnixMs: null,
                  elapsedBeforePauseMs: 0,
                  scheduledStartOffsetMs: 0,
                  capMs: null,
                  allowOvertime: true,
                },
              ],
        };
      }
      if (type === 'PAUSE') {
        const pausedAtUnixMs = new Date(authoredAt).getTime();
        const activePeriod = match.scoreboard.activePeriod;
        return {
          ...match,
          state: 'PAUSED',
          elapsedBeforePauseMs: this.elapsedMs(),
          timerStartedAt: null,
          timerStartedAtUnixMs: null,
          timerPausedAt: authoredAt,
          timerPausedAtUnixMs: pausedAtUnixMs,
          periodTimers: match.periodTimers.map((timer) => {
            if (timer.periodNumber !== activePeriod || timer.startedAtUnixMs == null) {
              return timer;
            }
            return {
              ...timer,
              elapsedBeforePauseMs:
                timer.elapsedBeforePauseMs + Math.max(0, pausedAtUnixMs - timer.startedAtUnixMs),
              startedAtUnixMs: null,
              pausedAtUnixMs,
            };
          }),
        };
      }
      if (type === 'SCORE_DELTA') {
        const side = payload['side'];
        const amount = Number(payload['amount']);
        return {
          ...match,
          scoreboard: {
            ...match.scoreboard,
            homeScore: match.scoreboard.homeScore + (side === 'HOME' ? amount : 0),
            awayScore: match.scoreboard.awayScore + (side === 'AWAY' ? amount : 0),
          },
        };
      }
      if (type === 'PERIOD_ROLL') {
        const number = (match.scoreboard.periods.at(-1)?.number ?? 0) + 1;
        const startedAtUnixMs = new Date(authoredAt).getTime();
        const previous = match.periodTimers.find((timer) => timer.periodNumber === match.scoreboard.activePeriod);
        const previousElapsed = previous
          ? previous.elapsedBeforePauseMs +
            (previous.startedAtUnixMs == null ? 0 : Math.max(0, startedAtUnixMs - previous.startedAtUnixMs))
          : 0;
        const scheduledStartOffsetMs =
          match.timerPeriodStartOffsetsMs[number - 1] ??
          (match.timerPeriodDurationMs ?? 0) * (number - 1);
        return {
          ...match,
          elapsedBeforePauseMs: scheduledStartOffsetMs,
          timerStartedAt: authoredAt,
          timerStartedAtUnixMs: startedAtUnixMs,
          timerPausedAt: null,
          timerPausedAtUnixMs: null,
          periodTimers: [
            ...match.periodTimers.map((timer) => timer.periodNumber === match.scoreboard.activePeriod
              ? {
                  ...timer,
                  elapsedBeforePauseMs: previousElapsed,
                  startedAtUnixMs: null,
                  pausedAtUnixMs: startedAtUnixMs,
                }
              : timer),
            {
              periodNumber: number,
              startedAtUnixMs,
              pausedAtUnixMs: null,
              elapsedBeforePauseMs: 0,
              scheduledStartOffsetMs,
              capMs: match.timerPeriodDurationMs ?? null,
              allowOvertime: match.timerAllowOvertime,
            },
          ],
          scoreboard: {
            ...match.scoreboard,
            activePeriod: number,
            periods: [
              ...match.scoreboard.periods.map((period) => ({ ...period, completed: true })),
              { number, label: `${number}º período`, homeScore: 0, awayScore: 0, completed: false },
            ],
          },
        };
      }
      if (type === 'SCORE_CORRECTION') {
        const scoreboard = payload['scoreboard'];
        if (!this.isScoreboardPayload(scoreboard)) {
          return match;
        }
        return {
          ...match,
          scoreboard: {
            homeScore: scoreboard.home,
            awayScore: scoreboard.away,
            activePeriod: scoreboard.activePeriodNumber,
            periods: scoreboard.periods.map((period) => ({
              number: period.number,
              label: period.label,
              homeScore: period.home,
              awayScore: period.away,
              completed: period.closed,
            })),
          },
        };
      }
      if (type === 'OCCURRENCE') {
        const occurrenceId = payload['occurrenceId'];
        const kind = payload['kind'];
        const note = payload['note'];
        if (
          typeof occurrenceId !== 'string' ||
          !this.isOccurrenceKind(kind) ||
          typeof note !== 'string'
        ) {
          return match;
        }
        return {
          ...match,
          occurrencesJson: JSON.stringify([
            ...this.parseOccurrences(match.occurrencesJson),
            { occurrenceId, kind, note, authoredAt },
          ]),
        };
      }
      if (type === 'FINALIZE') {
        return {
          ...match,
          state: payload['draw'] === true ? 'DRAW' : 'FINISHED',
          scoreboard: {
            ...match.scoreboard,
            homeScore: this.finalScoreForm.controls.homeScore.value,
            awayScore: this.finalScoreForm.controls.awayScore.value,
          },
          timerStartedAt: null,
        };
      }
      return match;
    });
  }

  private async resolveTimerConflict(conflict: SportsTimerConflict): Promise<void> {
    try {
      const server = await firstValueFrom(this.api.match(conflict.matchId));
      const choice = await firstValueFrom(
        this.dialog.open<SportsTimerConflictDialog, { server: SportsTimerSnapshot; device: SportsTimerSnapshot }, 'SERVER' | 'DEVICE'>(
          SportsTimerConflictDialog,
          {
            disableClose: true,
            width: 'min(620px, 96vw)',
            maxWidth: '96vw',
            data: { server: this.timerSnapshot(server), device: conflict.device },
          },
        ).afterClosed(),
      );
      if (choice === 'DEVICE') {
        const action: SportsMatchAction = {
          clientId: this.uuid(),
          matchId: server.id,
          baseRevision: server.revision,
          type: 'TIMER_RECONCILE',
          payloadJson: JSON.stringify({
            resolution: 'DEVICE',
            overall: conflict.device.overall,
            periods: conflict.device.periods,
            activePeriodNumber: conflict.device.activePeriod,
          }),
          authoredAt: new Date().toISOString(),
          offline: false,
        };
        await firstValueFrom(this.api.commit([action]));
      }
      this.offline.resolveTimerConflict(
        conflict.matchId,
        conflict.queuedActionIds,
        server.revision + (choice === 'DEVICE' ? 1 : 0),
      );
      this.handlingTimerConflict = null;
      this.load();
      this.snackbar.open(
        choice === 'DEVICE' ? 'Cronômetro deste dispositivo mantido.' : 'Cronômetro do servidor mantido.',
        'Fechar',
        { duration: 4500 },
      );
    } catch (error: unknown) {
      this.offline.postponeTimerConflict(conflict.matchId);
      this.handlingTimerConflict = null;
      this.showError(error);
    }
  }

  private timerSnapshot(source: SportsOperationalMatch | null = this.match()): SportsTimerSnapshot {
    return {
      overall: {
        startedAtUnixMs: source?.timerStartedAtUnixMs ??
          (source?.timerStartedAt ? new Date(source.timerStartedAt).getTime() : null),
        pausedAtUnixMs: source?.timerPausedAtUnixMs ??
          (source?.timerPausedAt ? new Date(source.timerPausedAt).getTime() : null),
        elapsedBeforePauseMs: source?.elapsedBeforePauseMs ?? 0,
      },
      periods: source?.periodTimers.map((timer) => ({ ...timer })) ?? [],
      activePeriod: source?.scoreboard.activePeriod ?? null,
    };
  }

  private isTimerAction(type: SportsMatchActionType): boolean {
    return type === 'START' || type === 'PAUSE' || type === 'RESUME' || type === 'PERIOD_ROLL' || type === 'TIMER_RECONCILE';
  }

  private parseOccurrences(value: string | null | undefined): MatchOccurrence[] {
    try {
      const parsed = JSON.parse(value ?? '[]') as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((entry): entry is MatchOccurrence => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return false;
        }
        const record = entry as Record<string, unknown>;
        return (
          typeof record['occurrenceId'] === 'string' &&
          this.isOccurrenceKind(record['kind']) &&
          typeof record['note'] === 'string'
        );
      });
    } catch {
      return [];
    }
  }

  private isOccurrenceKind(value: unknown): value is MatchOccurrence['kind'] {
    return (
      value === 'SUBSTITUTION' ||
      value === 'INJURY' ||
      value === 'DISCIPLINE' ||
      value === 'GENERAL'
    );
  }

  private elapsedMs(): number {
    const match = this.match();
    if (!match) {
      return 0;
    }
    const startedAt = match.timerStartedAtUnixMs ?? (match.timerStartedAt ? new Date(match.timerStartedAt).getTime() : null);
    const live = startedAt == null ? 0 : Math.max(0, this.now() - startedAt);
    return match.elapsedBeforePauseMs + live;
  }

  private formatElapsed(value: number): string {
    const totalSeconds = Math.floor(value / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
  }

  private scoreboardFromFinalForm(current: SportsScoreboard): {
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
  } {
    return {
      home: this.finalScoreForm.controls.homeScore.value,
      away: this.finalScoreForm.controls.awayScore.value,
      activePeriodNumber: current.activePeriod ?? null,
      periods: current.periods.map((period) => ({
        number: period.number,
        label: period.label,
        home: period.homeScore,
        away: period.awayScore,
        closed: period.completed,
      })),
    };
  }

  private isScoreboardPayload(value: unknown): value is {
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
  } {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const scoreboard = value as Record<string, unknown>;
    return (
      typeof scoreboard['home'] === 'number' &&
      typeof scoreboard['away'] === 'number' &&
      Array.isArray(scoreboard['periods'])
    );
  }

  private watchMatch(): void {
    if (!this.isBrowser || !this.matchId) {
      return;
    }
    this.subscriptions.add(
      this.realtime.watchMatch(this.matchId).subscribe({
        next: () => this.load(),
        error: () => {
          this.snackbar.open(
            'As atualizações ao vivo foram interrompidas. Reabra a partida para reconectar.',
            'Fechar',
            { duration: 5000 },
          );
        },
      }),
    );
  }

  private registrationId(side: 'home' | 'away'): string | null {
    return side === 'home' ? (this.match()?.homeRegistrationId ?? null) : (this.match()?.awayRegistrationId ?? null);
  }

  private uuid(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : 'Não foi possível registrar a ação.';
    this.snackbar.open(
      /mudou|revision|conflito/i.test(message)
        ? 'A partida mudou em outro aparelho. Reabra a tela antes de tentar novamente.'
        : message,
      'Fechar',
      { duration: 6000 },
    );
  }
}
