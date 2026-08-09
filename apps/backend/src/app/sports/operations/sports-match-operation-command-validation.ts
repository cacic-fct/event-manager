import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, SportsLossReason, SportsMatchActionType, SportsMatchState, SportsReviewStatus } from '@prisma/client';
import { AuditActor } from '../../audit-log/audit-log.types';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import {
  assertSportsOutcomeMatchesRules,
  assertSportsScoreDeltaMatchesRules,
  normalizeSportsScoreRules,
} from '../domain/sports-score-rules';
import { normalizeSportsScoreboard } from '../domain/sports-scoreboard';
import { projectSportsMatch, restoreSportsStopwatch, SportsProjectedOutcome } from './sports-match-projector';

export type SportsMatchActorKind = 'ADMIN' | 'OFFICIAL' | 'LINEUP_MANAGER';

export interface SportsMatchCommandActor {
  personId?: string | null;
  userId?: string | null;
  role: string;
  kind: SportsMatchActorKind;
  auditActor: AuthenticatedUser | AuditActor;
}

export interface SportsMatchCommandInput {
  clientId: string;
  matchId: string;
  baseRevision: number;
  type: SportsMatchActionType;
  payload: unknown;
  scorerRosterEntryId?: string | null;
  authoredAt: Date;
  offline?: boolean;
}

interface MatchProjectionContext {
  id: string;
  eventId: string;
  categoryId: string;
  revision: number;
  state: SportsMatchState;
  homeRegistrationId: string | null;
  awayRegistrationId: string | null;
  category: {
    eventGroupId: string;
    maximumPeriods: number | null;
    periodLabel: string | null;
    periodsEnabled: boolean;
    timerRules: Prisma.JsonValue;
    scoreRules: Prisma.JsonValue;
    tournament: {
      majorEventId: string;
    };
  };
}

import { SportsMatchOperationActorValidation } from './sports-match-operation-actor-validation';

export abstract class SportsMatchOperationCommandValidation extends SportsMatchOperationActorValidation {
  protected validateCommand(
    type: SportsMatchActionType,
    payloadValue: Prisma.InputJsonValue | Prisma.JsonValue,
    current: SportsProjectedOutcome,
    match: Pick<MatchProjectionContext, 'homeRegistrationId' | 'awayRegistrationId' | 'category'>,
    actorKind: SportsMatchActorKind,
  ): void {
    const payload = this.requireRecord(payloadValue);
    const activeStates: SportsMatchState[] = [SportsMatchState.LIVE, SportsMatchState.PAUSED];
    if (
      ([SportsMatchActionType.SCORE_DELTA, SportsMatchActionType.PERIOD_ROLL] as SportsMatchActionType[]).includes(
        type,
      ) &&
      !activeStates.includes(current.state)
    ) {
      throw new ConflictException('A partida precisa estar ao vivo para registrar placar.');
    }
    if (type === SportsMatchActionType.OCCURRENCE) {
      const kind = typeof payload['kind'] === 'string' ? payload['kind'].trim() : '';
      const occurrenceId = typeof payload['occurrenceId'] === 'string' ? payload['occurrenceId'].trim() : '';
      const note = typeof payload['note'] === 'string' ? payload['note'].trim() : '';
      if (!occurrenceId || occurrenceId.length > 100) {
        throw new BadRequestException('Informe um identificador válido para a ocorrência.');
      }
      if (!kind || kind.length > 80) {
        throw new BadRequestException('Informe o tipo da ocorrência.');
      }
      if (note.length > 1000) {
        throw new BadRequestException('A observação da ocorrência deve ter no máximo 1000 caracteres.');
      }
    }
    if (type === SportsMatchActionType.TIMER_RECONCILE) {
      if (actorKind === 'LINEUP_MANAGER') {
        throw new BadRequestException('Somente a arbitragem ou administradores podem reconciliar cronômetros.');
      }
      if (!activeStates.includes(current.state)) {
        throw new ConflictException('O cronômetro só pode ser reconciliado durante a partida.');
      }
      // Reuse the projector's strict safe-integer and shape validation without
      // changing the persisted match during command validation.
      projectSportsMatch(
        [
          {
            type,
            payload,
            authoredAt: new Date(),
            reviewStatus: SportsReviewStatus.PENDING,
          },
        ],
        {
          approvedOnly: false,
          hasCheckedInPlayers: false,
          maximumPeriods: match.category.maximumPeriods,
          periodLabel: match.category.periodLabel,
          periodsEnabled: match.category.periodsEnabled,
          timerRules: match.category.timerRules,
        },
      );
    }
    if (type === SportsMatchActionType.PERIOD_ROLL && !match.category.periodsEnabled) {
      throw new ConflictException('Esta modalidade não utiliza períodos ou sets.');
    }
    if (
      type === SportsMatchActionType.SCORE_CORRECTION &&
      actorKind !== 'ADMIN' &&
      !activeStates.includes(current.state)
    ) {
      throw new ConflictException('A partida precisa estar ao vivo para corrigir o placar.');
    }
    if (
      type === SportsMatchActionType.START &&
      !([SportsMatchState.SCHEDULED, SportsMatchState.CHECK_IN] as SportsMatchState[]).includes(current.state)
    ) {
      throw new ConflictException('A partida não pode ser iniciada neste estado.');
    }
    if (type === SportsMatchActionType.START && (!match.homeRegistrationId || !match.awayRegistrationId)) {
      throw new ConflictException('Defina as duas equipes antes de iniciar a partida.');
    }
    if (type === SportsMatchActionType.PAUSE && current.state !== SportsMatchState.LIVE) {
      throw new ConflictException('Somente uma partida ao vivo pode ser pausada.');
    }
    if (type === SportsMatchActionType.RESUME && current.state !== SportsMatchState.PAUSED) {
      throw new ConflictException('Somente uma partida pausada pode ser retomada.');
    }
    if (([SportsMatchActionType.FINALIZE, SportsMatchActionType.FORFEIT] as SportsMatchActionType[]).includes(type)) {
      if (
        !(
          [
            SportsMatchState.SCHEDULED,
            SportsMatchState.CHECK_IN,
            SportsMatchState.LIVE,
            SportsMatchState.PAUSED,
          ] as SportsMatchState[]
        ).includes(current.state)
      ) {
        throw new ConflictException('A partida não pode ser finalizada neste estado.');
      }
      this.validateOutcome(payload, current, match);
    }
    if (
      type === SportsMatchActionType.CANCEL &&
      !(
        [
          SportsMatchState.SCHEDULED,
          SportsMatchState.CHECK_IN,
          SportsMatchState.LIVE,
          SportsMatchState.PAUSED,
        ] as SportsMatchState[]
      ).includes(current.state)
    ) {
      throw new ConflictException('A partida não pode ser cancelada neste estado.');
    }
    if (
      actorKind === 'LINEUP_MANAGER' &&
      type === SportsMatchActionType.FORFEIT &&
      !([SportsMatchState.SCHEDULED, SportsMatchState.CHECK_IN] as SportsMatchState[]).includes(current.state)
    ) {
      throw new ConflictException('Capitães e técnicos só podem desistir antes do início da partida.');
    }
    if (type === SportsMatchActionType.SCORE_DELTA) {
      if (payload['side'] !== 'HOME' && payload['side'] !== 'AWAY') {
        throw new BadRequestException('Selecione o lado do placar.');
      }
      if (typeof payload['amount'] !== 'number' || !Number.isFinite(payload['amount']) || payload['amount'] === 0) {
        throw new BadRequestException('A alteração de placar deve ser um número diferente de zero.');
      }
      try {
        assertSportsScoreDeltaMatchesRules(payload['amount'], normalizeSportsScoreRules(match.category.scoreRules));
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Alteração de placar inválida.');
      }
    }
    if (type === SportsMatchActionType.SCORE_CORRECTION) {
      try {
        const scoreboard = normalizeSportsScoreboard(payload['scoreboard']);
        if (payload['stopwatch'] !== undefined) {
          restoreSportsStopwatch(current, scoreboard, payload['stopwatch'], {
            maximumPeriods: match.category.maximumPeriods,
            periodLabel: match.category.periodLabel,
          });
        }
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Correção de placar inválida.');
      }
    }
    if (
      actorKind !== 'ADMIN' &&
      ([SportsMatchActionType.RESET, SportsMatchActionType.RESCHEDULE] as SportsMatchActionType[]).includes(type)
    ) {
      throw new BadRequestException('Somente administradores podem redefinir ou reagendar a partida.');
    }
    if (type === SportsMatchActionType.RESCHEDULE) {
      this.readRescheduleDates(payload);
    }
  }

  protected validateOutcome(
    payload: Record<string, unknown>,
    current: SportsProjectedOutcome,
    match: Pick<MatchProjectionContext, 'homeRegistrationId' | 'awayRegistrationId' | 'category'>,
  ): void {
    const scoreboard =
      payload['scoreboard'] === undefined ? current.scoreboard : normalizeSportsScoreboard(payload['scoreboard']);
    if (payload['draw'] === true) {
      if (payload['winnerRegistrationId'] || payload['loserRegistrationId']) {
        throw new BadRequestException('Um empate não pode possuir vencedor ou perdedor.');
      }
      try {
        assertSportsOutcomeMatchesRules({
          draw: true,
          drawWillReschedule: payload['drawWillReschedule'] === true,
          scoreboard,
          winnerSide: null,
          lossReason: null,
          rules: normalizeSportsScoreRules(match.category.scoreRules),
        });
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Resultado inválido.');
      }
      return;
    }
    const winner = this.readString(payload['winnerRegistrationId']);
    const loser = this.readString(payload['loserRegistrationId']);
    const participants = new Set(
      [match.homeRegistrationId, match.awayRegistrationId].filter((id): id is string => Boolean(id)),
    );
    if (!winner || !loser || winner === loser || !participants.has(winner) || !participants.has(loser)) {
      throw new BadRequestException('Revise as equipes vencedora e perdedora.');
    }
    if (
      typeof payload['lossReason'] !== 'string' ||
      !Object.values(SportsLossReason).includes(payload['lossReason'] as SportsLossReason)
    ) {
      throw new BadRequestException('Informe o motivo da derrota.');
    }
    try {
      assertSportsOutcomeMatchesRules({
        draw: false,
        drawWillReschedule: false,
        scoreboard,
        winnerSide: winner === match.homeRegistrationId ? 'HOME' : 'AWAY',
        lossReason: payload['lossReason'] as SportsLossReason,
        rules: normalizeSportsScoreRules(match.category.scoreRules),
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Resultado inválido.');
    }
  }
}
