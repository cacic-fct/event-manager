import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { SportsViewerRealtimeService } from '../viewer/sports-viewer-realtime.service';
import { SportsOfflineQueueService } from './sports-offline-queue.service';
import { SportsOperationsApiService } from './sports-operations-api.service';
import { SportsConfirmationDialog, SportsConfirmationDialogData } from './sports-confirmation-dialog';
import {
  SportsMatchAction,
  SportsMatchActionType,
  SportsOperationalMatch,
  SportsScoreboard,
} from './sports-operations.types';

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

@Component({
  selector: 'app-official-sports-match-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatDialogModule,
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
  private readonly snackbar = inject(MatSnackBar);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

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
  readonly revision = signal(1);
  readonly pendingCount = computed(() => this.offline.pendingForMatch(this.matchId));
  readonly homeCheckInEntries = computed(() => this.checkInEntries().filter((entry) => entry.team === 'home'));
  readonly awayCheckInEntries = computed(() => this.checkInEntries().filter((entry) => entry.team === 'away'));
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
    return state === 'LIVE' || state === 'PAUSED' || state === 'AWAITING_REVIEW';
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
  readonly occurrences = computed(() => this.parseOccurrences(this.match()?.occurrencesJson));

  private matchId = '';
  private timer: ReturnType<typeof setInterval> | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly subscriptions = new Subscription();

  ngOnInit(): void {
    this.matchId = this.route.snapshot.paramMap.get('matchId') ?? '';
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

  private actionSuccessMessage(type: SportsMatchActionType): string | null {
    const messages: Record<SportsMatchActionType, string | null> = {
      CHECK_IN: null,
      START: 'Partida iniciada.',
      PAUSE: 'Cronômetro pausado.',
      RESUME: 'Cronômetro retomado.',
      SCORE_DELTA: null,
      SCORE_CORRECTION: 'Correção do placar aplicada.',
      PERIOD_ROLL: 'Novo período iniciado.',
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
        return { ...match, state: 'LIVE', timerStartedAt: authoredAt, timerPausedAt: null };
      }
      if (type === 'PAUSE') {
        return {
          ...match,
          state: 'PAUSED',
          elapsedBeforePauseMs: this.elapsedMs(),
          timerStartedAt: null,
          timerPausedAt: authoredAt,
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
        return {
          ...match,
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
    const live = match.timerStartedAt ? Math.max(0, this.now() - new Date(match.timerStartedAt).getTime()) : 0;
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
