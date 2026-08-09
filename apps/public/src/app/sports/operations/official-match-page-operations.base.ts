import { firstValueFrom } from 'rxjs';
import type {
  SportsMatchAction,
  SportsMatchActionType,
  SportsScoreboard,
  SportsTimerConflict,
  SportsTimerRestoration,
  SportsTimerSnapshot,
} from './sports-operations.types';
import { SportsTimerConflictDialog } from './sports-timer-conflict-dialog';
import {
  formatSportsElapsed,
  isMatchOccurrenceKind,
  isSportsTimerAction,
  parseMatchOccurrences,
  type MatchOccurrence,
} from './official-match-page.utils';
import { OfficialMatchPageControls } from './official-match-page-controls.base';

export abstract class OfficialMatchPageOperations extends OfficialMatchPageControls {
  protected async dispatch(type: SportsMatchActionType, payload: Record<string, unknown>): Promise<boolean> {
    const match = this.match();
    if (!match || this.busy()) {
      return false;
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
      if (result === 'queued' && isSportsTimerAction(type, payload)) {
        this.offline.attachTimerSnapshot(action.clientId, this.timerSnapshot());
      }
      const message =
        result === 'queued'
          ? 'Ação salva neste dispositivo. Ela será enviada quando a conexão voltar.'
          : this.actionSuccessMessage(type);
      if (message) {
        this.snackbar.open(message, 'Fechar', { duration: 3500 });
      }
      return true;
    } catch (error: unknown) {
      this.showError(error);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected async registerScannedAttendance(code: string): Promise<void> {
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
      if (result === 'queued') {
        this.revision.update((revision) => revision + 1);
      } else {
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
            ? match.periodTimers.map((timer) =>
                timer.periodNumber === periodNumber ? { ...timer, startedAtUnixMs, pausedAtUnixMs: null } : timer,
              )
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
              elapsedBeforePauseMs: timer.elapsedBeforePauseMs + Math.max(0, pausedAtUnixMs - timer.startedAtUnixMs),
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
          match.timerPeriodStartOffsetsMs[number - 1] ?? (match.timerPeriodDurationMs ?? 0) * (number - 1);
        return {
          ...match,
          elapsedBeforePauseMs: scheduledStartOffsetMs,
          timerStartedAt: authoredAt,
          timerStartedAtUnixMs: startedAtUnixMs,
          timerPausedAt: null,
          timerPausedAtUnixMs: null,
          periodTimers: [
            ...match.periodTimers.map((timer) =>
              timer.periodNumber === match.scoreboard.activePeriod
                ? {
                    ...timer,
                    elapsedBeforePauseMs: previousElapsed,
                    startedAtUnixMs: null,
                    pausedAtUnixMs: startedAtUnixMs,
                  }
                : timer,
            ),
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
        const stopwatch = this.isTimerRestoration(payload['stopwatch']) ? payload['stopwatch'] : null;
        return {
          ...match,
          ...(stopwatch
            ? {
                state: stopwatch.state,
                timerStartedAt:
                  stopwatch.overall.startedAtUnixMs == null
                    ? null
                    : new Date(stopwatch.overall.startedAtUnixMs).toISOString(),
                timerStartedAtUnixMs: stopwatch.overall.startedAtUnixMs,
                timerPausedAt:
                  stopwatch.overall.pausedAtUnixMs == null
                    ? null
                    : new Date(stopwatch.overall.pausedAtUnixMs).toISOString(),
                timerPausedAtUnixMs: stopwatch.overall.pausedAtUnixMs,
                elapsedBeforePauseMs: stopwatch.overall.elapsedBeforePauseMs,
                periodTimers: stopwatch.periods.map((timer) => ({ ...timer })),
              }
            : {}),
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
        if (typeof occurrenceId !== 'string' || !isMatchOccurrenceKind(kind) || typeof note !== 'string') {
          return match;
        }
        return {
          ...match,
          occurrencesJson: JSON.stringify([
            ...parseMatchOccurrences(match.occurrencesJson),
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

  protected async resolveTimerConflict(conflict: SportsTimerConflict): Promise<void> {
    try {
      const server = await firstValueFrom(this.api.match(conflict.matchId));
      const choice = await firstValueFrom(
        this.dialog
          .open<
            SportsTimerConflictDialog,
            { server: SportsTimerSnapshot; device: SportsTimerSnapshot },
            'SERVER' | 'DEVICE'
          >(SportsTimerConflictDialog, {
            disableClose: true,
            width: 'min(620px, 96vw)',
            maxWidth: '96vw',
            data: { server: this.timerSnapshot(server), device: conflict.device },
          })
          .afterClosed(),
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

  protected parseOccurrences(value: string | null | undefined): MatchOccurrence[] {
    return parseMatchOccurrences(value);
  }

  protected elapsedMs(): number {
    const match = this.match();
    if (!match) {
      return 0;
    }
    const startedAt =
      match.timerStartedAtUnixMs ?? (match.timerStartedAt ? new Date(match.timerStartedAt).getTime() : null);
    const live = startedAt == null ? 0 : Math.max(0, this.now() - startedAt);
    return match.elapsedBeforePauseMs + live;
  }

  protected formatElapsed(value: number): string {
    return formatSportsElapsed(value);
  }

  protected scoreboardFromFinalForm(current: SportsScoreboard): {
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

  private isTimerRestoration(value: unknown): value is SportsTimerRestoration {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const restoration = value as Record<string, unknown>;
    const overall = restoration['overall'];
    return (
      (restoration['state'] === 'LIVE' || restoration['state'] === 'PAUSED') &&
      overall !== null &&
      typeof overall === 'object' &&
      !Array.isArray(overall) &&
      Array.isArray(restoration['periods']) &&
      (restoration['activePeriod'] === null || Number.isSafeInteger(restoration['activePeriod']))
    );
  }

  protected watchMatch(): void {
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

  protected registrationId(side: 'home' | 'away'): string | null {
    return side === 'home' ? (this.match()?.homeRegistrationId ?? null) : (this.match()?.awayRegistrationId ?? null);
  }

  protected uuid(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  protected showError(error: unknown): void {
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
