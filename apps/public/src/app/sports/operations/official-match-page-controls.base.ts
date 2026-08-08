import { MatStepper } from '@angular/material/stepper';
import { AztecScannerDialogComponent } from '@cacic-fct/shared-angular';
import { SportsConfirmationDialog, SportsConfirmationDialogData } from './sports-confirmation-dialog';
import type { SportsOperationalMatch } from './sports-operations.types';
import type { CheckInEntry, MatchOccurrence } from './official-match-page.utils';
import { sortCheckInEntries } from './official-match-page.utils';
import { OfficialMatchPageState } from './official-match-page-state.base';

export abstract class OfficialMatchPageControls extends OfficialMatchPageState {
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
        entries.map((candidate) => (candidate.id === entry.id ? { ...candidate, checkedIn: present } : candidate)),
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
}
