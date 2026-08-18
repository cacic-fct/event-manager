import { MatStepper } from '@angular/material/stepper';
import { AztecScannerDialogComponent } from '@cacic-fct/shared-angular';
import { ConfirmationDialogComponent, ConfirmationDialogData } from '@cacic-fct/shared-angular';
import {
  sportsMatchStateLabel,
  sportsOfficialRoleLabel,
  sportsRosterRoleLabel,
} from '@cacic-fct/shared-data-types/sports-metadata';
import type { SportsOperationalMatch, SportsTimerRestoration } from './sports-operations.types';
import type { CheckInEntry, MatchOccurrence, OfficialCheckInEntry } from './official-match-page.utils';
import { sortCheckInEntries } from './official-match-page.utils';
import { OfficialMatchPageState } from './official-match-page-state.base';

export abstract class OfficialMatchPageControls extends OfficialMatchPageState {
  private periodRollUndo: {
    matchId: string;
    newPeriodNumber: number;
    restoration: SportsTimerRestoration;
  } | null = null;

  startHold(event?: PointerEvent): void {
    if (event && (!event.isPrimary || event.button !== 0)) {
      return;
    }
    event?.preventDefault();
    const state = this.match()?.state;
    if (this.busy() || this.holdTimer || (state !== 'SCHEDULED' && state !== 'CHECK_IN')) {
      return;
    }
    this.holdingStart.set(true);
    this.holdTimer = setTimeout(() => {
      this.holdTimer = null;
      this.holdingStart.set(false);
      void this.dispatch('START', this.readinessIssues().length > 0 ? { readinessOverride: true } : {});
    }, 900);
  }

  startKeyboardHold(event: KeyboardEvent): void {
    if ((event.key !== 'Enter' && event.key !== ' ') || event.repeat) {
      return;
    }
    event.preventDefault();
    this.startHold();
  }

  cancelKeyboardHold(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    this.cancelStartHold();
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
    const changed = await this.dispatch('SCORE_DELTA', {
      side: side.toUpperCase(),
      amount,
      periodNumber: this.match()?.scoreboard.activePeriod ?? undefined,
    });
    if (changed && this.finalizeOpen()) {
      this.finalScoreForm.patchValue({
        homeScore: this.scoreFor('home'),
        awayScore: this.scoreFor('away'),
      });
    }
  }

  async rollPeriod(): Promise<void> {
    const match = this.match();
    if (!match || (match.state !== 'LIVE' && match.state !== 'PAUSED')) {
      return;
    }
    const newPeriodNumber = (match.scoreboard.periods.at(-1)?.number ?? 0) + 1;
    const restoration: SportsTimerRestoration = {
      ...this.timerSnapshot(),
      state: match.state,
    };
    if (await this.dispatch('PERIOD_ROLL', {})) {
      this.periodRollUndo = { matchId: match.id, newPeriodNumber, restoration };
    }
  }

  async saveOccurrence(): Promise<void> {
    if (this.occurrenceForm.invalid || !this.canEditScore()) {
      return;
    }
    const value = this.occurrenceForm.getRawValue();
    const saved = await this.dispatch('OCCURRENCE', {
      occurrenceId: this.uuid(),
      kind: value.kind,
      note: value.note.trim(),
    });
    if (saved) {
      this.occurrenceForm.controls.note.reset();
    }
  }

  async undoPeriod(): Promise<void> {
    const match = this.match();
    if (!match || !this.canUndoPeriod()) {
      return;
    }
    const periods = match.scoreboard.periods.slice(0, -1);
    const activePeriod = periods.at(-1)?.number ?? null;
    const restoration = this.timerRestorationForUndo(match, activePeriod);
    const payload: Record<string, unknown> = {
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
    };
    if (restoration) {
      payload['stopwatch'] = restoration;
    }
    if (await this.dispatch('SCORE_CORRECTION', payload)) {
      this.periodRollUndo = null;
    }
  }

  private timerRestorationForUndo(
    match: SportsOperationalMatch,
    activePeriod: number | null,
  ): SportsTimerRestoration | null {
    const saved = this.periodRollUndo;
    if (saved?.matchId === match.id && saved.newPeriodNumber === match.scoreboard.activePeriod) {
      return saved.restoration;
    }
    if (activePeriod === null || (match.state !== 'LIVE' && match.state !== 'PAUSED')) {
      return null;
    }
    const currentPeriod = match.scoreboard.periods.at(-1);
    const previousPeriod = match.scoreboard.periods.at(-2);
    const currentTimer = currentPeriod
      ? match.periodTimers.find((timer) => timer.periodNumber === currentPeriod.number)
      : undefined;
    const previousTimer = previousPeriod
      ? match.periodTimers.find((timer) => timer.periodNumber === previousPeriod.number)
      : undefined;
    const rollAt = currentTimer?.startedAtUnixMs ?? currentTimer?.pausedAtUnixMs;
    if (!currentPeriod || !previousPeriod || !currentTimer || !previousTimer || rollAt == null) {
      return null;
    }
    const isLive = match.state === 'LIVE';
    const restoredPreviousTimer = {
      ...previousTimer,
      startedAtUnixMs: isLive ? rollAt : null,
      pausedAtUnixMs: isLive ? null : (previousTimer.pausedAtUnixMs ?? rollAt),
    };
    return {
      state: match.state,
      overall: {
        startedAtUnixMs: isLive ? rollAt : null,
        pausedAtUnixMs: isLive ? null : (previousTimer.pausedAtUnixMs ?? rollAt),
        elapsedBeforePauseMs: previousTimer.scheduledStartOffsetMs + previousTimer.elapsedBeforePauseMs,
      },
      periods: match.periodTimers
        .filter((timer) => timer.periodNumber !== currentPeriod.number)
        .map((timer) => (timer.periodNumber === previousPeriod.number ? restoredPreviousTimer : timer)),
      activePeriod,
    };
  }

  swapSides(): void {
    this.sidesSwapped.update((swapped) => !swapped);
  }

  async toggleCheckIn(entry: CheckInEntry): Promise<void> {
    if (this.busy() || !this.canEditCheckIn()) {
      return;
    }
    const present = !entry.checkedIn;
    const checkedInAt = new Date().toISOString();
    this.busy.set(true);
    try {
      const result = await this.offline.dispatchCheckIn({
        clientId: this.uuid(),
        matchId: this.matchId,
        rosterEntryId: entry.id,
        checkedInAt,
        offline: false,
        present,
      });
      this.syncCheckInViews({
        attendanceSyncKey: entry.attendanceSyncKey,
        checkedInAt,
        present,
        rosterEntryId: entry.id,
      });
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

  async toggleOfficialCheckIn(official: OfficialCheckInEntry): Promise<void> {
    if (this.busy() || !this.canEditCheckIn()) {
      return;
    }
    const present = !official.checkedIn;
    this.busy.set(true);
    const checkedInAt = new Date().toISOString();
    try {
      const result = await this.offline.dispatchOfficialCheckIn({
        clientId: this.uuid(),
        matchId: this.matchId,
        officialAssignmentId: official.id,
        checkedInAt,
        offline: false,
        present,
      });
      this.syncCheckInViews({
        attendanceSyncKey: official.attendanceSyncKey,
        checkedInAt,
        officialAssignmentId: official.id,
        present,
      });
      this.revision.update((revision) => revision + 1);
      this.snackbar.open(
        result === 'queued'
          ? `A correção de ${official.name} foi salva neste dispositivo e será sincronizada.`
          : present
            ? `${official.name} confirmado na partida.`
            : `Presença de ${official.name} removida.`,
        'Fechar',
        { duration: 3500 },
      );
    } catch (error: unknown) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  private syncCheckInViews(options: {
    attendanceSyncKey?: string | null;
    checkedInAt: string;
    officialAssignmentId?: string;
    present: boolean;
    rosterEntryId?: string;
  }): void {
    const checkedInAt = options.present ? options.checkedInAt : null;
    const matchesSyncKey = (candidateKey?: string | null): boolean =>
      options.attendanceSyncKey != null && candidateKey === options.attendanceSyncKey;

    this.checkInEntries.update((entries) =>
      entries.map((entry) =>
        entry.id === options.rosterEntryId || matchesSyncKey(entry.attendanceSyncKey)
          ? { ...entry, checkedIn: options.present }
          : entry,
      ),
    );
    this.match.update((match) =>
      match
        ? {
            ...match,
            officials: match.officials.map((official) =>
              official.id === options.officialAssignmentId || matchesSyncKey(official.attendanceSyncKey)
                ? { ...official, checkedInAt }
                : official,
            ),
            rosters: match.rosters.map((roster) => ({
              ...roster,
              entries: roster.entries.map((entry) =>
                entry.id === options.rosterEntryId || matchesSyncKey(entry.attendanceSyncKey)
                  ? { ...entry, checkedInAt }
                  : entry,
              ),
            })),
          }
        : match,
    );
  }

  requestCheckInEdit(): void {
    if (!this.canRequestCheckInCorrection()) {
      return;
    }
    this.dialog
      .open<ConfirmationDialogComponent, ConfirmationDialogData, boolean>(ConfirmationDialogComponent, {
        data: {
          title: 'Editar check-in após o início?',
          message: 'A partida já saiu da etapa de check-in. Desbloqueie somente para corrigir uma presença.',
          confirmLabel: 'Sim, editar',
          cancelLabel: 'Não',
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
    this.dialog
      .open<AztecScannerDialogComponent, unknown, string>(AztecScannerDialogComponent, {
        width: 'min(560px, 96vw)',
        maxWidth: '96vw',
        data: {
          acceptedPrefixes: ['user:'],
          title: 'Escanear atleta da partida',
          mode: ['Aztec'],
        },
      })
      .afterClosed()
      .subscribe((code) => {
        if (code) {
          void this.registerScannedAttendance(code);
        }
      });
  }

  openFinalize(): void {
    this.dialog
      .open<ConfirmationDialogComponent, ConfirmationDialogData, boolean>(ConfirmationDialogComponent, {
        data: {
          title: 'Finalizar esta partida?',
          message: 'Sim abre a revisão final do resultado. Nenhum resultado será enviado antes da última confirmação.',
          confirmLabel: 'Sim, revisar resultado',
          cancelLabel: 'Não',
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
      const paused = await this.dispatch('PAUSE', {});
      if (!paused) {
        return;
      }
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
    const finalized = await this.dispatch('FINALIZE', {
      draw,
      drawWillReschedule: draw ? this.outcomeForm.controls.drawWillReschedule.value : undefined,
      winnerRegistrationId: winnerRegistrationId ?? undefined,
      loserRegistrationId: loserRegistrationId ?? undefined,
      lossReason: draw ? undefined : this.reasonForm.controls.reason.value,
      lossReasonDetail: draw ? undefined : this.reasonForm.controls.detail.value || undefined,
      scoreboard: this.scoreboardFromFinalForm(match.scoreboard),
    });
    if (finalized) {
      this.finalizeOpen.set(false);
    }
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
    const role = sportsRosterRoleLabel(entry.role);
    return entry.shirtNumber == null ? role : `${role} - camisa ${entry.shirtNumber}`;
  }

  officialRoleDetail(official: OfficialCheckInEntry): string {
    return sportsOfficialRoleLabel(official.role);
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

  protected sortedCheckInEntries(team: CheckInEntry['team']): CheckInEntry[] {
    return sortCheckInEntries(this.checkInEntries(), team, this.match()?.state);
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
    return sportsMatchStateLabel(state);
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
}
